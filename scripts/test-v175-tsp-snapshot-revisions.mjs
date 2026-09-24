import { readFile } from "node:fs/promises";
import pg from "pg";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // DATABASE_URL may already be supplied by the environment.
  }
}

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923193000_v175_tsp_snapshot_revisions.sql",
    "utf8"
  ),
  rpcMigration: await readFile(
    "supabase/migrations/20260923194500_v175_tsp_atomic_revision_rpc.sql",
    "utf8"
  ),
  actions: await readFile("app/tsp/actions.ts", "utf8"),
  tracker: await readFile("lib/tsp-tracker.ts", "utf8"),
  prices: await readFile("lib/tsp-prices.ts", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  localInit: await readFile("scripts/local-db-init.mjs", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast175(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 1 ||
    (major === 1 &&
      (minor > 7 || (minor === 7 && patch >= 5)))
  );
}

const checks = [
  ["release includes V1.7.5 or newer", atLeast175(pkg.version)],
  [
    "snapshot revisions and supersedes link exist",
    files.migration.includes("add column if not exists revision integer") &&
      files.migration.includes("supersedes_id uuid") &&
      files.migration.includes("revision >= 1"),
  ],
  [
    "same-date uniqueness now includes revision",
    files.migration.includes(
      "tsp_snapshots_household_date_revision_uidx"
    ) &&
      files.migration.includes(
        "household_id, snapshot_date, revision"
      ),
  ],
  [
    "atomic revision RPC uses transaction-scoped advisory lock",
    files.rpcMigration.includes(
      "create or replace function public.insert_tsp_snapshot_revision"
    ) &&
      files.rpcMigration.includes("pg_advisory_xact_lock") &&
      files.rpcMigration.includes("security invoker"),
  ],
  [
    "bounded retry only handles revision-number conflicts",
    files.rpcMigration.includes("v_attempt >= 3") &&
      files.rpcMigration.includes("get stacked diagnostics") &&
      files.rpcMigration.includes(
        "tsp_snapshots_household_date_revision_uidx"
      ),
  ],
  [
    "RPC execution is restricted",
    files.rpcMigration.includes(
      "revoke execute on function public.insert_tsp_snapshot_revision"
    ) &&
      files.rpcMigration.includes("from public, anon") &&
      files.rpcMigration.includes("to authenticated"),
  ],
  [
    "confirmed snapshot facts are no longer broadly updateable",
    files.migration.includes(
      "revoke update, delete on public.tsp_snapshots from authenticated"
    ) &&
      files.migration.includes(
        "grant select, insert on public.tsp_snapshots to authenticated"
      ),
  ],
  [
    "fund balance rows permit only derived price-anchor updates",
    files.migration.includes(
      "revoke update, delete on public.tsp_fund_positions from authenticated"
    ) &&
      files.migration.includes("snapshot_share_price") &&
      files.migration.includes("snapshot_price_date"),
  ],
  [
    "save path uses one atomic RPC rather than multi-step snapshot writes",
    files.actions.includes(
      'supabase.rpc(\n    "insert_tsp_snapshot_revision"'
    ) &&
      files.actions.includes("p_funds_json: JSON.stringify(fundRows)") &&
      !files.actions.includes(
        '.from("tsp_snapshots")\n    .upsert('
      ) &&
      !files.actions.includes(
        '.from("tsp_fund_positions")\n      .insert(fundRows)'
      ),
  ],
  [
    "tracker chooses latest revision per date and deduplicates history",
    files.tracker.includes('.order("revision", { ascending: false })') &&
      files.tracker.includes("seenDates") &&
      files.tracker.includes("supersedesId"),
  ],
  [
    "price sync and estimate choose latest same-date revision",
    (
      files.prices.match(
        /\.order\("revision", \{/g
      ) ?? []
    ).length >= 2,
  ],
  [
    "TSP UI exposes authoritative imported history",
    files.page.includes("snapshot.revision") ||
      (
        files.page.includes("Last imported") &&
        files.page.includes("Source file")
      ),
  ],
  [
    "local migration runner preserves migration checksum history",
    files.localInit.includes("local_migrations") &&
      files.localInit.includes("checksum") &&
      files.localInit.includes("add a new migration instead of editing history"),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  throw new Error(
    `V1.7.5 static invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Run npm run local:repair before npm run test:v175."
  );
}

const { Client } = pg;
const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
const TEST_DATE = "2026-09-23";
const FUNCTION_SIGNATURE =
  "public.insert_tsp_snapshot_revision(uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,text,text)";

const admin = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5_000,
});

let householdId = null;

async function callRevision(sequence, fundsOverride = null) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });

  await client.connect();

  try {
    const funds =
      fundsOverride ??
      [
        {
          fund_code: "C",
          fund_name: "Common Stock Index Investment Fund",
          balance_cents: 100_000 + sequence,
        },
        {
          fund_code: "G",
          fund_name: "Government Securities Investment Fund",
          balance_cents: 50_000,
        },
      ];

    const result = await client.query(
      `
        select *
        from public.insert_tsp_snapshot_revision(
          $1::uuid,
          $2::date,
          $3::bigint,
          $4::bigint,
          $5::bigint,
          $6::bigint,
          $7::bigint,
          $8::bigint,
          $9::text,
          $10::text
        )
      `,
      [
        householdId,
        TEST_DATE,
        120_000 + sequence,
        30_000,
        0,
        10_000,
        1_000,
        4_000,
        `V1.7.5 concurrency test ${sequence}`,
        JSON.stringify(funds),
      ]
    );

    return result.rows[0];
  } finally {
    await client.end();
  }
}

await admin.connect();

try {
  const household = await admin.query(
    `
      insert into public.households(
        name,
        base_currency,
        created_by
      )
      values ($1, 'USD', $2::uuid)
      returning id
    `,
    [
      `V1.7.5 TSP revision test ${Date.now()}-${process.pid}`,
      LOCAL_USER_ID,
    ]
  );

  householdId = household.rows[0]?.id ?? null;

  if (!householdId) {
    throw new Error(
      "Unable to create disposable V1.7.5 test household."
    );
  }

  const privileges = await admin.query(
    `
      select
        has_function_privilege(
          'anon',
          $1,
          'EXECUTE'
        ) as anon_execute,
        has_function_privilege(
          'authenticated',
          $1,
          'EXECUTE'
        ) as authenticated_execute
    `,
    [FUNCTION_SIGNATURE]
  );

  if (
    privileges.rows[0]?.anon_execute !== false ||
    privileges.rows[0]?.authenticated_execute !== true
  ) {
    throw new Error(
      "V1.7.5 RPC execute privileges are not restricted as expected."
    );
  }

  const concurrent = await Promise.all(
    [1, 2, 3, 4].map((sequence) =>
      callRevision(sequence)
    )
  );

  const returnedRevisions = concurrent
    .map((row) => Number(row?.revision))
    .sort((a, b) => a - b);

  if (
    JSON.stringify(returnedRevisions) !==
    JSON.stringify([1, 2, 3, 4])
  ) {
    throw new Error(
      `Concurrent revision allocation failed: ${JSON.stringify(
        returnedRevisions
      )}`
    );
  }

  const snapshots = await admin.query(
    `
      select id, revision, supersedes_id
      from public.tsp_snapshots
      where household_id = $1
        and snapshot_date = $2::date
      order by revision
    `,
    [householdId, TEST_DATE]
  );

  if (snapshots.rows.length !== 4) {
    throw new Error(
      `Expected 4 immutable revisions, found ${snapshots.rows.length}.`
    );
  }

  for (let index = 0; index < snapshots.rows.length; index += 1) {
    const row = snapshots.rows[index];
    const expectedRevision = index + 1;

    if (Number(row.revision) !== expectedRevision) {
      throw new Error(
        `Expected revision ${expectedRevision}, found ${row.revision}.`
      );
    }

    const expectedSupersedes =
      index === 0
        ? null
        : snapshots.rows[index - 1].id;

    if ((row.supersedes_id ?? null) !== expectedSupersedes) {
      throw new Error(
        `Revision ${expectedRevision} has the wrong supersedes_id.`
      );
    }
  }

  const positions = await admin.query(
    `
      select
        s.revision,
        count(p.id)::int as fund_count
      from public.tsp_snapshots s
      left join public.tsp_fund_positions p
        on p.snapshot_id = s.id
      where s.household_id = $1
        and s.snapshot_date = $2::date
      group by s.revision
      order by s.revision
    `,
    [householdId, TEST_DATE]
  );

  if (
    positions.rows.some(
      (row) => Number(row.fund_count) !== 2
    )
  ) {
    throw new Error(
      "A prior TSP revision lost or duplicated its fund positions."
    );
  }

  const beforeAtomicFailure = snapshots.rows.length;

  let duplicateFundFailed = false;
  try {
    await callRevision(99, [
      {
        fund_code: "C",
        fund_name: "Duplicate C 1",
        balance_cents: 10_000,
      },
      {
        fund_code: "C",
        fund_name: "Duplicate C 2",
        balance_cents: 20_000,
      },
    ]);
  } catch {
    duplicateFundFailed = true;
  }

  if (!duplicateFundFailed) {
    throw new Error(
      "Expected duplicate fund codes to fail the atomic revision write."
    );
  }

  const afterFailure = await admin.query(
    `
      select count(*)::int as count
      from public.tsp_snapshots
      where household_id = $1
        and snapshot_date = $2::date
    `,
    [householdId, TEST_DATE]
  );

  if (
    Number(afterFailure.rows[0]?.count) !==
    beforeAtomicFailure
  ) {
    throw new Error(
      "Failed fund-position insert left behind a partial TSP snapshot."
    );
  }

  console.log(
    "✓ Postgres concurrency: four simultaneous same-date saves produced revisions 1-4"
  );
  console.log(
    "✓ Postgres immutability: every revision retained its own fund rows"
  );
  console.log(
    "✓ Postgres atomicity: failed fund insert rolled back the snapshot revision"
  );
  console.log(
    "✓ Postgres privileges: anon denied, authenticated RPC execute allowed"
  );
} finally {
  if (householdId) {
    await admin
      .query(
        "delete from public.tsp_snapshots where household_id = $1",
        [householdId]
      )
      .catch(() => {});
    await admin
      .query(
        "delete from public.households where id = $1",
        [householdId]
      )
      .catch(() => {});
  }

  await admin.end();
}

console.log(
  "V1.7.5 TSP snapshot revision invariants and Postgres behavior passed."
);
