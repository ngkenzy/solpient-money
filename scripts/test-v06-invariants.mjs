import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";

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
  await allSourceText("components"),
  await allSourceText("supabase/migrations"),
].join("\n");

const migration = await readFile(
  "supabase/migrations/20260922070000_v06_plaid_sandbox.sql",
  "utf8"
);
const config = await readFile(
  "lib/plaid/config.ts",
  "utf8"
);
const sync = await readFile(
  "lib/plaid/sync.ts",
  "utf8"
);
const packageJson = JSON.parse(
  await readFile("package.json", "utf8")
);

const checks = [
  [
    "react-plaid-link pinned",
    packageJson.dependencies?.[
      "react-plaid-link"
    ] === "5.0.0",
  ],
  [
    "V0.6 remains Sandbox-only",
    config.includes(
      'baseUrl: "https://sandbox.plaid.com"'
    ) &&
      !config.includes(
        "production.plaid.com"
      ),
  ],
  [
    "banking uses Transactions",
    config.includes(
      'products: ["transactions"]'
    ),
  ],
  [
    "investments is an initial product",
    config.includes(
      'products: ["investments"]'
    ),
  ],
  [
    "transactions use cursor sync",
    sync.includes(
      '"/transactions/sync"'
    ) &&
      sync.includes("next_cursor"),
  ],
  [
    "investments use holdings endpoint",
    sync.includes(
      '"/investments/holdings/get"'
    ),
  ],
  [
    "Plaid metadata schema preserved",
    migration.includes(
      "public.plaid_connections"
    ),
  ],
  [
    "tokens remain in private schema",
    migration.includes(
      "private.plaid_access_tokens"
    ),
  ],
  [
    "token encryption uses AES-256-GCM",
    source.includes(
      'createCipheriv("aes-256-gcm"'
    ),
  ],
  [
    "no Plaid secret default committed",
    !/PLAID_SECRET\s*=\s*["'][^"']+["']/.test(
      source
    ),
  ],
  [
    "no plaintext access-token column",
    !migration.includes(
      "access_token text"
    ),
  ],
  [
    "local runtime has no Supabase imports",
    !source.includes("@supabase/"),
  ],
  [
    "Connections route exists",
    source.includes(
      'href: "/connections"'
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
    `V0.6 local invariant failure: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V0.6 Plaid Sandbox local privacy and architecture checks passed."
);
