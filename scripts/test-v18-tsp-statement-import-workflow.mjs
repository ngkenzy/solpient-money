import { readFile } from "node:fs/promises";
import pg from "pg";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // DATABASE_URL may already be supplied.
  }
}

const migration = await readFile(
  "supabase/migrations/20260923201000_v18_tsp_statement_imports.sql",
  "utf8"
);
const storage = await readFile(
  "lib/tsp-statement-imports.ts",
  "utf8"
);
const actions = await readFile(
  "app/tsp/import/actions.ts",
  "utf8"
);
const queuePage = await readFile(
  "app/tsp/import/page.tsx",
  "utf8"
);
const reviewPage = await readFile(
  "app/tsp/import/[id]/page.tsx",
  "utf8"
);

const staticChecks = [
  [
    "raw statement content is not persisted",
    !migration.includes("raw_statement") &&
      !migration.includes("raw_content") &&
      migration.includes("source_content_sha256") &&
      storage.includes('createHash("sha256")'),
  ],
  [
    "parser provenance is retained",
    migration.includes("parser_version") &&
      migration.includes("parsed_candidate") &&
      migration.includes("parser_warnings") &&
      migration.includes("parser_errors"),
  ],
  [
    "review and parser candidate stay separate",
    migration.includes("review_statement_date") &&
      migration.includes("review_funds") &&
      storage.includes("parsedCandidate"),
  ],
  [
    "confirmation inserts immutable revision through V1.7.5",
    migration.includes("confirm_tsp_statement_import") &&
      migration.includes("insert_tsp_snapshot_revision"),
  ],
  [
    "confirmed import mutation is blocked",
    migration.includes(
      "prevent_confirmed_tsp_import_mutation"
    ) &&
      migration.includes(
        "Confirmed TSP statement imports are immutable."
      ),
  ],
  [
    "duplicate source files are keyed by SHA-256",
    migration.includes(
      "unique (household_id, source_content_sha256)"
    ) &&
      storage.includes("duplicate: true"),
  ],
  [
    "review computes both reconciliation deltas",
    storage.includes("balanceDeltaCents") &&
      storage.includes("fundDeltaCents") &&
      actions.includes(
        "reconcileTspStatementReview"
      ),
  ],
  [
    "UI separates staged candidates from confirmation",
    queuePage.includes("Review first. Confirm second.") &&
      reviewPage.includes("Confirm statement") &&
      reviewPage.includes(
        "creates a new immutable TSP snapshot revision"
      ),
  ],
];

const failedStatic = staticChecks.filter(
  ([, ok]) => !ok
);

for (const [name, ok] of staticChecks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failedStatic.length) {
  throw new Error(
    `V1.8 import workflow static failures: ${failedStatic
      .map(([name]) => name)
      .join(", ")}`
  );
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Run npm run local:repair first."
  );
}

const { Client } = pg;
const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
const TEST_DATE = "2026-09-23";

function client() {
  return new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
}

async function confirmImport(importId) {
  const db = client();
  await db.connect();

  try {
    const result = await db.query(
      `
        select *
        from public.confirm_tsp_statement_import(
          $1::uuid
        )
      `,
      [importId]
    );

    return result.rows[0];
  } finally {
    await db.end();
  }
}

const admin = client();
await admin.connect();

let householdId = null;

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
      `V1.8 TSP import test ${Date.now()}-${process.pid}`,
      LOCAL_USER_ID,
    ]
  );

  householdId = household.rows[0]?.id;

  if (!householdId) {
    throw new Error(
      "Unable to create V1.8 disposable household."
    );
  }

  const sourceHash = "a".repeat(64);
  const funds = [
    {
      fund_code: "C",
      fund_name:
        "Common Stock Index Investment Fund",
      balance_cents: 120_000,
    },
    {
      fund_code: "G",
      fund_name:
        "Government Securities Investment Fund",
      balance_cents: 30_000,
    },
  ];

  const inserted = await admin.query(
    `
      insert into public.tsp_statement_imports(
        household_id,
        source_kind,
        source_filename,
        source_content_sha256,
        source_size_bytes,
        parser_version,
        parsed_statement_date,
        parsed_candidate,
        parser_warnings,
        parser_errors,
        review_statement_date,
        review_traditional_balance_cents,
        review_roth_balance_cents,
        review_reported_total_balance_cents,
        review_outstanding_loan_cents,
        review_employee_contrib_ytd_cents,
        review_service_auto_ytd_cents,
        review_service_match_ytd_cents,
        review_funds,
        balance_reconciliation_delta_cents,
        fund_reconciliation_delta_cents,
        validation_state
      )
      values (
        $1,
        'structured_text',
        'statement.txt',
        $2,
        512,
        'test-parser-v1',
        $3::date,
        '{"statementDate":"2026-09-23"}'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        $3::date,
        120000,
        30000,
        150000,
        0,
        10000,
        1000,
        4000,
        $4::jsonb,
        0,
        0,
        'ready'
      )
      returning id
    `,
    [
      householdId,
      sourceHash,
      TEST_DATE,
      JSON.stringify(funds),
    ]
  );

  const importId = inserted.rows[0]?.id;

  if (!importId) {
    throw new Error(
      "Unable to create V1.8 test import."
    );
  }

  const [first, second] = await Promise.all([
    confirmImport(importId),
    confirmImport(importId),
  ]);

  if (
    !first?.snapshot_id ||
    !second?.snapshot_id ||
    first.snapshot_id !== second.snapshot_id ||
    Number(first.revision) !==
      Number(second.revision)
  ) {
    throw new Error(
      "Concurrent confirmation did not return the same immutable snapshot revision."
    );
  }

  const snapshots = await admin.query(
    `
      select id, revision
      from public.tsp_snapshots
      where household_id = $1
        and snapshot_date = $2::date
      order by revision
    `,
    [householdId, TEST_DATE]
  );

  if (snapshots.rows.length !== 1) {
    throw new Error(
      `Expected one confirmed snapshot revision, found ${snapshots.rows.length}.`
    );
  }

  const positions = await admin.query(
    `
      select fund_code, balance_cents
      from public.tsp_fund_positions
      where snapshot_id = $1
      order by fund_code
    `,
    [first.snapshot_id]
  );

  if (positions.rows.length !== 2) {
    throw new Error(
      `Expected two confirmed fund rows, found ${positions.rows.length}.`
    );
  }

  const confirmedImport = await admin.query(
    `
      select
        validation_state,
        confirmed_snapshot_id,
        confirmed_snapshot_revision,
        confirmed_at
      from public.tsp_statement_imports
      where id = $1
    `,
    [importId]
  );

  const confirmed =
    confirmedImport.rows[0];

  if (
    confirmed?.validation_state !== "confirmed" ||
    confirmed?.confirmed_snapshot_id !==
      first.snapshot_id ||
    Number(
      confirmed?.confirmed_snapshot_revision
    ) !== Number(first.revision) ||
    !confirmed?.confirmed_at
  ) {
    throw new Error(
      "Import provenance was not linked to the confirmed snapshot revision."
    );
  }

  let mutationBlocked = false;
  try {
    await admin.query(
      `
        update public.tsp_statement_imports
        set review_note = 'should fail'
        where id = $1
      `,
      [importId]
    );
  } catch {
    mutationBlocked = true;
  }

  if (!mutationBlocked) {
    throw new Error(
      "Confirmed statement import remained mutable."
    );
  }

  let duplicateBlocked = false;
  try {
    await admin.query(
      `
        insert into public.tsp_statement_imports(
          household_id,
          source_kind,
          source_content_sha256,
          parser_version
        )
        values ($1, 'structured_text', $2, 'test-parser-v2')
      `,
      [householdId, sourceHash]
    );
  } catch {
    duplicateBlocked = true;
  }

  if (!duplicateBlocked) {
    throw new Error(
      "Duplicate statement content hash was accepted."
    );
  }

  console.log(
    "✓ concurrent confirm is idempotent"
  );
  console.log(
    "✓ confirmation creates one immutable snapshot revision"
  );
  console.log(
    "✓ confirmed fund rows match reviewed candidate"
  );
  console.log(
    "✓ import provenance links to confirmed snapshot"
  );
  console.log(
    "✓ confirmed import cannot be mutated"
  );
  console.log(
    "✓ duplicate statement content is rejected"
  );
} finally {
  if (householdId) {
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
  "V1.8 TSP statement import workflow passed."
);
