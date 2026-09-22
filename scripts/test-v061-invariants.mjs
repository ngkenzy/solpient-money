import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  accounts: await readFile("app/accounts/page.tsx", "utf8"),
  transactions: await readFile("components/TransactionsExplorer.tsx", "utf8"),
  portfolio: await readFile("app/portfolio/page.tsx", "utf8"),
  autoRefresh: await readFile("components/PlaidAutoRefresh.tsx", "utf8"),
  actions: await readFile("components/PlaidConnectionActions.tsx", "utf8"),
  updateRoute: await readFile("app/api/plaid/update-link-token/route.ts", "utf8"),
  syncRoute: await readFile("app/api/plaid/sync/route.ts", "utf8"),
  connectorRoute: await readFile("app/api/connect/sync/route.ts", "utf8"),
  plaidAdapter: await readFile("lib/connect/adapters/plaid.ts", "utf8"),
  moneyData: await readFile("lib/money-data.ts", "utf8"),
  connections: await readFile("app/connections/page.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

const checks = [
  ["release includes V0.6.1 or newer", /^0\.(?:[7-9]|6\.(?:[1-9]|[1-9][0-9]+))/.test(pkg.version) || pkg.version === "0.6.1"],
  ["persistent Sandbox context remains visible", files.connections.includes("PLAID SANDBOX TEST DATA")],
  ["database source metadata reaches MoneyDataset", files.moneyData.includes('source: (row.source ?? "manual")')],
  ["Plaid accounts are marked test data", files.accounts.includes("PLAID TEST")],
  ["Plaid transactions are marked test data", files.transactions.includes("PLAID TEST")],
  ["Plaid holdings are marked test data", files.portfolio.includes("PLAID TEST")],
  ["Connections explicitly warns about Sandbox test data", files.connections.includes("PLAID SANDBOX TEST DATA")],
  ["page-open refresh runs every five minutes", files.autoRefresh.includes("5 * 60 * 1000")],
  ["page-open refresh routes Plaid through Connector SDK", files.autoRefresh.includes('fetch("/api/connect/sync"') && files.autoRefresh.includes('connectorId: "plaid"')],
  ["repair route uses existing access token", files.updateRoute.includes("access_token: accessToken")],
  ["repair route does not exchange a public token", !files.updateRoute.includes("/item/public_token/exchange")],
  ["repair UI opens update-mode endpoint", files.actions.includes('fetch("/api/plaid/update-link-token"')],
  ["legacy Plaid route delegates to Connector SDK", files.syncRoute.includes('runConnectorSync') && files.syncRoute.includes('"plaid"')],
  ["generic connector sync route exists", files.connectorRoute.includes("runConnectorSync") && files.connectorRoute.includes("connectorId")],
  ["ITEM_LOGIN_REQUIRED becomes repairable", files.plaidAdapter.includes('"ITEM_LOGIN_REQUIRED"') && files.plaidAdapter.includes('"needs_update"')],
  ["invalid access tokens require reconnect", files.plaidAdapter.includes('"INVALID_ACCESS_TOKEN"') && files.plaidAdapter.includes("Reconnect required.")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
}
if (failed.length) {
  throw new Error(`V0.6.1 invariant failure: ${failed.map(([name]) => name).join(", ")}`);
}

console.log("V0.6.1 Sandbox hardening checks passed.");
