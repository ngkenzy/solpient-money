import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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
  await allSourceText("components"),
  await allSourceText("supabase/migrations"),
].join("\n");

const migration = await readFile(
  "supabase/migrations/20260922070000_v06_plaid_sandbox.sql",
  "utf8"
);
const config = await readFile("lib/plaid/config.ts", "utf8");
const sync = await readFile("lib/plaid/sync.ts", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

const checks = [
  ["react-plaid-link pinned", packageJson.dependencies?.["react-plaid-link"] === "5.0.0"],
  ["V0.6 is Sandbox-only", config.includes('baseUrl: "https://sandbox.plaid.com"') && !config.includes("production.plaid.com")],
  ["banking uses Transactions", config.includes('products: ["transactions"]')],
  ["investments is an initial product", config.includes('products: ["investments"]')],
  ["transactions use cursor sync", sync.includes('"/transactions/sync"') && sync.includes("next_cursor")],
  ["investments use holdings endpoint", sync.includes('"/investments/holdings/get"')],
  ["Plaid connection table has RLS", migration.includes("alter table public.plaid_connections enable row level security")],
  ["anonymous Plaid metadata access revoked", migration.includes("revoke all on public.plaid_connections from anon")],
  ["tokens live in private schema", migration.includes("private.plaid_access_tokens")],
  ["token table has no anon/auth grants", migration.includes("revoke all on private.plaid_access_tokens from public, anon, authenticated")],
  ["token encryption uses AES-256-GCM", source.includes('createCipheriv("aes-256-gcm"')],
  ["no Plaid secret default committed", !/PLAID_SECRET\s*=\s*["'][^"']+["']/.test(source)],
  ["no plaintext access-token column", !migration.includes("access_token text")],
  ["Connections route exists", source.includes('href: "/connections"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (failed.length) {
  throw new Error(`V0.6 invariant failure: ${failed.map(([name]) => name).join(", ")}`);
}

const baseUrl=(process.env.NEXT_PUBLIC_MONEY_SUPABASE_URL||"https://lvbkyxnptohcwqtuxxxh.supabase.co").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_WuuXjwPMHnohCu3D9WSP0w_ydWGaEyJ";

const privateRead=await fetch(`${baseUrl}/rest/v1/plaid_connections?select=id&limit=1`,{
  headers:{apikey:key,Accept:"application/json"},
});
if(privateRead.ok){
  throw new Error("Anonymous client unexpectedly read plaid_connections.");
}
if(![401,403].includes(privateRead.status)){
  throw new Error(`Unexpected plaid_connections anonymous status: ${privateRead.status}`);
}

const tokenRpc=await fetch(`${baseUrl}/rest/v1/rpc/get_plaid_access_token`,{
  method:"POST",
  headers:{apikey:key,"Content-Type":"application/json"},
  body:JSON.stringify({p_connection_id:"00000000-0000-0000-0000-000000000000"}),
});
if(tokenRpc.ok){
  throw new Error("Anonymous client unexpectedly executed get_plaid_access_token.");
}
if(![401,403].includes(tokenRpc.status)){
  throw new Error(`Unexpected token RPC anonymous status: ${tokenRpc.status}`);
}

console.log("V0.6 Plaid Sandbox privacy and architecture checks passed.");
