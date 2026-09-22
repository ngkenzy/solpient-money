import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const migration = await readFile(
  "supabase/migrations/20260922050000_v05_money_schema.sql",
  "utf8"
);
const proxy = await readFile("lib/supabase/proxy.ts", "utf8");
const serverClient = await readFile("lib/supabase/server.ts", "utf8");
const moneyData = await readFile("lib/money-data.ts", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

const requiredTables = [
  "profiles",
  "households",
  "household_members",
  "accounts",
  "transactions",
  "holdings",
  "goals",
  "planning_assumptions",
  "net_worth_snapshots",
  "portfolio_snapshots",
  "user_preferences",
];

async function allSourceText(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const parts = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      parts.push(await allSourceText(full));
    } else if (/\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) {
      parts.push(await readFile(full, "utf8"));
    }
  }
  return parts.join("\n");
}

const source = [
  await allSourceText("app"),
  await allSourceText("lib"),
  migration,
].join("\n");

const checks = [
  ["Supabase SSR dependency is pinned", packageJson.dependencies?.["@supabase/ssr"] === "0.12.7"],
  ["Supabase JS dependency is pinned", packageJson.dependencies?.["@supabase/supabase-js"] === "2.116.0"],
  ["auth proxy verifies claims", proxy.includes("auth.getClaims()")],
  ["server client is request scoped", serverClient.includes("await cookies()")],
  ["Money env namespace is isolated", source.includes("NEXT_PUBLIC_MONEY_SUPABASE_URL")],
  ["database adapter exists", moneyData.includes("export async function requireMoneyDataset")],
  ["private owner trigger exists", migration.includes("private.add_household_owner_membership")],
  ["private trigger execution revoked", migration.includes("revoke all on function private.add_household_owner_membership() from public, anon, authenticated")],
  ["membership rows are read-only to clients", migration.includes("grant select on public.household_members to authenticated")],
  ["anonymous financial access revoked", requiredTables.every((table) => migration.includes(`revoke all on public.${table} from anon`))],
  ["all exposed Money tables enable RLS", requiredTables.every((table) => migration.includes(`alter table public.${table} enable row level security`))],
  ["no service-role key in application source", !/service[_-]?role/i.test(source)],
  ["no user_metadata authorization source", !/raw_user_meta_data|user_metadata/i.test(source)],
  ["Money schema does not contain Research tables", !migration.includes("research_runs") && !migration.includes("money_research_snapshots_v1")],
  ["account child rows are household-bound", migration.includes("transactions_account_household_fk") && migration.includes("holdings_account_household_fk")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (failed.length) {
  throw new Error(`V0.5 invariant failure: ${failed.map(([name]) => name).join(", ")}`);
}
