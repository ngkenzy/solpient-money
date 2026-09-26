import pg from "pg";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be populated.
  }
}

const sourceUrl =
  process.env.SOLPIENT_SOURCE_DATABASE_URL?.trim();
const targetUrl =
  process.env.DATABASE_URL?.trim();
const requestedUserId =
  process.env.SOLPIENT_SOURCE_USER_ID?.trim();
const replace = process.argv.includes("--replace");

if (!sourceUrl) {
  throw new Error(
    "SOLPIENT_SOURCE_DATABASE_URL is required for the one-time hosted-to-local migration. Set it temporarily in your shell; do not commit it."
  );
}
if (!targetUrl) {
  throw new Error(
    "DATABASE_URL is missing. Run npm run local:setup first."
  );
}

const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
const LOCAL_EMAIL =
  process.env.SOLPIENT_LOCAL_USER_EMAIL?.trim() ||
  "local@solpient.local";

const { Client } = pg;
const source = new Client({
  connectionString: sourceUrl,
});
const target = new Client({
  connectionString: targetUrl,
});

function ident(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(
      `Unsafe identifier: ${value}`
    );
  }
  return `"${value}"`;
}

async function rows(client, sql, values = []) {
  return (await client.query(sql, values)).rows;
}

async function copyRows(
  table,
  sourceRows,
  transform = (row) => row
) {
  if (!sourceRows.length) {
    console.log(`${table}: 0`);
    return;
  }

  const transformed = sourceRows.map(transform);
  const columns = Array.from(
    new Set(
      transformed.flatMap((row) =>
        Object.keys(row)
      )
    )
  );

  let copied = 0;
  for (const row of transformed) {
    const values = columns.map((column) =>
      Object.prototype.hasOwnProperty.call(
        row,
        column
      )
        ? row[column]
        : null
    );
    const placeholders = values.map(
      (_, index) => `$${index + 1}`
    );
    await target.query(
      `insert into public.${ident(table)}
       (${columns.map(ident).join(", ")})
       values (${placeholders.join(", ")})
       on conflict do nothing`,
      values
    );
    copied += 1;
  }

  console.log(`${table}: ${copied}`);
}

await source.connect();
await target.connect();

try {
  const users = await rows(
    source,
    `select distinct hm.user_id::text as user_id
     from public.household_members hm
     order by 1`
  );

  let sourceUserId = requestedUserId || null;
  if (!sourceUserId) {
    if (users.length !== 1) {
      throw new Error(
        `Remote Money database has ${users.length} household users. Set SOLPIENT_SOURCE_USER_ID explicitly so Solpient only migrates the intended user's households.`
      );
    }
    sourceUserId = users[0].user_id;
  }

  const householdRows = await rows(
    source,
    `select h.*
     from public.households h
     join public.household_members hm
       on hm.household_id = h.id
     where hm.user_id = $1::uuid
     order by h.created_at`,
    [sourceUserId]
  );

  if (!householdRows.length) {
    throw new Error(
      "No Money households were found for the selected source user."
    );
  }

  const householdIds =
    householdRows.map((row) => row.id);

  const localCount = Number(
    (
      await rows(
        target,
        "select count(*)::int as count from public.households"
      )
    )[0]?.count ?? 0
  );

  if (localCount > 0 && !replace) {
    throw new Error(
      "Local Solpient already contains a household. Re-run with --replace only if you intend to replace all local Money household data."
    );
  }

  await target.query("begin");

  try {
    if (replace) {
      await target.query(
        "delete from public.households"
      );
      await target.query(
        "delete from public.profiles where user_id = $1::uuid",
        [LOCAL_USER_ID]
      );
      await target.query(
        "delete from public.user_preferences where user_id = $1::uuid",
        [LOCAL_USER_ID]
      );
    }

    await target.query(
      `insert into auth.users(id,email,updated_at)
       values ($1::uuid,$2,now())
       on conflict (id) do update
       set email=excluded.email, updated_at=now()`,
      [LOCAL_USER_ID, LOCAL_EMAIL]
    );

    const sourceProfile = (
      await rows(
        source,
        "select * from public.profiles where user_id = $1::uuid",
        [sourceUserId]
      )
    )[0];

    if (sourceProfile) {
      await copyRows(
        "profiles",
        [sourceProfile],
        (row) => ({
          ...row,
          user_id: LOCAL_USER_ID,
        })
      );
    }

    await copyRows(
      "households",
      householdRows,
      (row) => ({
        ...row,
        created_by: LOCAL_USER_ID,
      })
    );

    // The household insert trigger creates local owner membership.
    const connectionTables = [
      "plaid_connections",
      "direct_ofx_connections",
      "oauth_fdx_connections",
    ];

    for (const table of connectionTables) {
      const sourceRows = await rows(
        source,
        `select *
         from public.${ident(table)}
         where household_id = any($1::uuid[])`,
        [householdIds]
      );
      await copyRows(
        table,
        sourceRows,
        (row) => ({
          ...row,
          status: "needs_update",
          last_error_code:
            "LOCAL_MIGRATION_RECONNECT",
          last_error_message:
            "Connection metadata migrated to Solpient Local without encrypted cloud token material. Reconnect this provider locally.",
        })
      );
    }

    const accountRows = await rows(
      source,
      `select *
       from public.accounts
       where household_id = any($1::uuid[])`,
      [householdIds]
    );
    await copyRows("accounts", accountRows);

    const importProfiles = await rows(
      source,
      `select *
       from public.file_import_profiles
       where household_id = any($1::uuid[])`,
      [householdIds]
    );
    await copyRows(
      "file_import_profiles",
      importProfiles
    );

    const importBatches = await rows(
      source,
      `select *
       from public.file_import_batches
       where household_id = any($1::uuid[])`,
      [householdIds]
    );
    await copyRows(
      "file_import_batches",
      importBatches
    );

    for (const table of [
      "transactions",
      "holdings",
      "goals",
      "planning_assumptions",
      "net_worth_snapshots",
      "portfolio_snapshots",
    ]) {
      const sourceRows = await rows(
        source,
        `select *
         from public.${ident(table)}
         where household_id = any($1::uuid[])`,
        [householdIds]
      );
      await copyRows(table, sourceRows);
    }

    const sourcePreference = (
      await rows(
        source,
        `select *
         from public.user_preferences
         where user_id = $1::uuid`,
        [sourceUserId]
      )
    )[0];

    const activeHouseholdId =
      sourcePreference?.active_household_id &&
      householdIds
        .map(String)
        .includes(
          String(
            sourcePreference.active_household_id
          )
        )
        ? sourcePreference.active_household_id
        : householdIds[0];

    await target.query(
      `insert into public.user_preferences
       (user_id, active_household_id, updated_at)
       values ($1::uuid,$2::uuid,now())
       on conflict (user_id) do update
       set active_household_id=excluded.active_household_id,
           updated_at=now()`,
      [LOCAL_USER_ID, activeHouseholdId]
    );

    await target.query("commit");
  } catch (error) {
    await target.query("rollback");
    throw error;
  }

  console.log("");
  console.log(
    "Hosted Money data copied to Solpient Local."
  );
  console.log(
    "Encrypted connector token/credential vaults were intentionally NOT copied."
  );
  console.log(
    "Direct OFX connections were marked needs_update. Direct OFX has been removed; reconnect those accounts with a file import via /connect."
  );
  console.log(
    "After verification, remove SOLPIENT_SOURCE_DATABASE_URL from your shell/history and retire the hosted Money database when you are ready."
  );
} finally {
  await source.end();
  await target.end();
}
