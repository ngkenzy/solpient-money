import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
});

await client.connect();

try {
  const checks = await client.query(`
    select
      to_regclass('public.accounts') is not null as accounts,
      to_regclass('public.transactions') is not null as transactions,
      to_regclass('public.holdings') is not null as holdings,
      to_regclass('public.file_import_batches') is not null as file_import_batches,
      to_regclass('public.plaid_connections') is not null as plaid_connections,
      to_regclass('public.direct_ofx_connections') is not null as direct_ofx_connections,
      to_regclass('public.oauth_fdx_connections') is not null as oauth_fdx_connections,
      to_regclass('private.oauth_fdx_tokens') is not null as oauth_fdx_tokens,
      to_regclass('public.truth_merchant_rules') is not null as truth_merchant_rules,
      to_regclass('public.account_merge_audit') is not null as account_merge_audit,
      to_regclass('public.financial_plan_snapshots') is not null as financial_plan_snapshots,
      to_regprocedure('public.merge_truth_accounts(uuid,uuid)') is not null as merge_truth_accounts,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'transactions'
          and column_name = 'truth_category'
      ) as truth_category,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'holdings'
          and column_name = 'truth_suppressed'
      ) as truth_suppressed,
      to_regclass('public.local_migrations') is not null as local_migrations,
      auth.uid()::text as local_user_id
  `);

  const row = checks.rows[0];

  for (const key of [
    "accounts",
    "transactions",
    "holdings",
    "file_import_batches",
    "plaid_connections",
    "direct_ofx_connections",
    "oauth_fdx_connections",
    "oauth_fdx_tokens",
    "truth_merchant_rules",
    "account_merge_audit",
    "financial_plan_snapshots",
    "merge_truth_accounts",
    "truth_category",
    "truth_suppressed",
    "local_migrations",
  ]) {
    if (row[key] !== true) {
      throw new Error(`Missing local PostgreSQL object: ${key}`);
    }
  }

  if (
    row.local_user_id !==
    "00000000-0000-0000-0000-000000000001"
  ) {
    throw new Error(
      `Unexpected local identity: ${row.local_user_id}`
    );
  }

  const migrationCount = await client.query(
    "select count(*)::int as count from public.local_migrations"
  );

  if (Number(migrationCount.rows[0]?.count ?? 0) < 1) {
    throw new Error(
      "No Solpient migrations were recorded."
    );
  }

  console.log(
    `Live PostgreSQL migration test passed with ${migrationCount.rows[0].count} migrations.`
  );
} finally {
  await client.end();
}
