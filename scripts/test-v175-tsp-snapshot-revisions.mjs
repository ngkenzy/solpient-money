import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923193000_v175_tsp_snapshot_revisions.sql",
    "utf8"
  ),
  actions: await readFile("app/tsp/actions.ts", "utf8"),
  tracker: await readFile("lib/tsp-tracker.ts", "utf8"),
  prices: await readFile("lib/tsp-prices.ts", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  localInit: await readFile("scripts/local-db-init.mjs", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

const checks = [
  ["release is V1.7.5", pkg.version === "1.7.5"],
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
    "save path creates a new snapshot revision rather than upserting",
    files.actions.includes('select("id,revision")') &&
      files.actions.includes('order("revision"') &&
      files.actions.includes(".insert({") &&
      files.actions.includes("supersedes_id") &&
      !files.actions.includes(
        '.from("tsp_snapshots")\n    .upsert('
      ),
  ],
  [
    "save path no longer deletes prior fund positions",
    !files.actions.includes(
      '.from("tsp_fund_positions")\n    .delete()'
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
    "TSP UI exposes current revision",
    files.page.includes("snapshot.revision"),
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
  process.exitCode = 1;
  throw new Error(
    `V1.7.5 TSP snapshot revision failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.7.5 TSP snapshot revision invariants passed.");
