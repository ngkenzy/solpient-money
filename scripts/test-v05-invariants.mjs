import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";

const migration = await readFile(
  "supabase/migrations/20260922050000_v05_money_schema.sql",
  "utf8"
);
const compose = await readFile(
  "docker-compose.local.yml",
  "utf8"
);
const localClient = await readFile(
  "lib/local-db/client.ts",
  "utf8"
);
const localAuth = await readFile(
  "lib/money-auth.ts",
  "utf8"
);
const moneyData = await readFile(
  "lib/money-data.ts",
  "utf8"
);
const packageJson = JSON.parse(
  await readFile("package.json", "utf8")
);

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
  const entries = await readdir(dir, {
    withFileTypes: true,
  });
  const parts = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        ["node_modules", ".next", ".git"].includes(
          entry.name
        )
      ) {
        continue;
      }
      parts.push(await allSourceText(full));
    } else if (
      /\.(ts|tsx|js|mjs|sql)$/.test(
        entry.name
      )
    ) {
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
  [
    "Supabase runtime packages removed",
    !packageJson.dependencies?.["@supabase/ssr"] &&
      !packageJson.dependencies?.["@supabase/supabase-js"],
  ],
  [
    "node-postgres is pinned",
    packageJson.dependencies?.pg === "8.23.0",
  ],
  [
    "PostgreSQL is localhost only",
    compose.includes(
      '"127.0.0.1:${SOLPIENT_DB_PORT:-55433}:5432"'
    ),
  ],
  [
    "server-only local DB client exists",
    localClient.includes(
      'import "server-only"'
    ) &&
      localClient.includes(
        "export class LocalDbClient"
      ),
  ],
  [
    "local identity replaces cloud auth",
    localAuth.includes("LOCAL_USER_ID") &&
      !localAuth.includes("auth.getClaims"),
  ],
  [
    "database adapter exists",
    moneyData.includes(
      "export async function requireMoneyDataset"
    ) &&
      moneyData.includes(
        "createLocalDbClient"
      ),
  ],
  [
    "private owner trigger preserved",
    migration.includes(
      "private.add_household_owner_membership"
    ),
  ],
  [
    "legacy household controls preserved in schema",
    requiredTables.every((table) =>
      migration.includes(
        `alter table public.${table} enable row level security`
      )
    ),
  ],
  [
    "no service-role key in application source",
    !/service[_-]?role/i.test(source),
  ],
  [
    "Money schema remains separate from Research",
    !migration.includes("research_runs") &&
      !migration.includes(
        "money_research_snapshots_v1"
      ),
  ],
  [
    "account child rows remain household-bound",
    migration.includes(
      "transactions_account_household_fk"
    ) &&
      migration.includes(
        "holdings_account_household_fk"
      ),
  ],
];

const failed = checks.filter(
  ([, ok]) => !ok
);
for (const [name, ok] of checks) {
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${name}`
  );
}
if (failed.length) {
  throw new Error(
    `Local Money invariant failure: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}
