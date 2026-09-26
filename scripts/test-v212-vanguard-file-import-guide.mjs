import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

if (!process.execArgv.some((arg) => arg.includes("strip-types"))) {
  const rerun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit" }
  );
  process.exit(rerun.status ?? 1);
}

const { parseUniversalFinancialFile } = await import(
  "../lib/connect/universal-parser.ts"
);

const files = {
  guide: await readFile(
    "components/VanguardFileImportGuide.tsx",
    "utf8"
  ),
  connectPage: await readFile("app/connect/page.tsx", "utf8"),
  guided: await readFile(
    "components/VanguardGuidedConnect.tsx",
    "utf8"
  ),
  css: await readFile("app/globals.css", "utf8"),
  packageJson: await readFile("package.json", "utf8"),
  buildYml: await readFile(".github/workflows/build.yml", "utf8"),
};

const pkg = JSON.parse(files.packageJson);
const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

// ---- Runtime: Vanguard combined CSV is auto-detected ----
const vanguardCsv = [
  "Account Number,Investment Name,Symbol,Shares,Share Price,Total Value",
  "12345678,Vanguard Total Stock Market Index Fund,VTSAX,100.5,145.23,14595.62",
  "12345678,Vanguard Federal Money Market Fund,VMFXX,500,1.00,500.00",
  "Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Net Amount",
  "12345678,09/20/2026,09/22/2026,Dividend,Vanguard Total Stock Market Index Fund dividend,Vanguard Total Stock Market Index Fund,VTSAX,,,125.40",
  "12345678,09/15/2026,09/17/2026,Buy,Purchase,Vanguard Total Stock Market Index Fund,VTSAX,10,145.23,-1452.30",
].join("\n");

const result = parseUniversalFinancialFile(
  "vanguard-download.csv",
  vanguardCsv
);

check(
  "Vanguard CSV detected as vanguard-investment source",
  result?.sourceId === "vanguard-investment"
);
check(
  "Vanguard CSV detected with high confidence",
  typeof result?.confidence === "number" && result.confidence >= 0.9
);
check(
  "provider recorded as Vanguard",
  result?.provider === "Vanguard"
);
check(
  "account named for the Vanguard account",
  typeof result?.accountName === "string" &&
    result.accountName.includes("Vanguard")
);

const holdingsDataset = (result?.datasets ?? []).find((dataset) =>
  String(dataset.sourceLabel ?? "").toLowerCase().includes("holding")
);
const holdings = holdingsDataset?.parsed?.holdings ?? [];
check(
  "Vanguard holdings parsed (VTSAX + VMFXX)",
  holdings.length === 2 &&
    holdings.some((holding) => holding.ticker === "VTSAX") &&
    holdings.some((holding) => holding.ticker === "VMFXX")
);

const transactionsDataset = (result?.datasets ?? []).find((dataset) =>
  String(dataset.sourceLabel ?? "").toLowerCase().includes("activity")
);
const transactions = transactionsDataset?.parsed?.transactions ?? [];
check(
  "Vanguard activity parsed (dividend + buy)",
  transactions.length === 2
);
check(
  "dividend maps to investment income",
  transactions.some(
    (tx) => tx.type === "income" && tx.category === "Investment Income"
  )
);
check(
  "buy maps to investment activity transfer",
  transactions.some((tx) => tx.type === "transfer")
);

// ---- Static: guide component wiring ----
check(
  "guide component exists",
  files.guide.length > 0
);
check(
  "guide walks through download, drop, and review",
  files.guide.includes("Download from Vanguard") &&
    files.guide.includes("Drop the file in the import center below") &&
    files.guide.includes("Review and confirm")
);
check(
  "guide links to the import center anchor",
  files.guide.includes('href="#import-center"')
);
check(
  "guide mentions the 14-day freshness nudge",
  files.guide.includes("14 days")
);
check(
  "guide states imports are deduplicated",
  files.guide.toLowerCase().includes("deduplicated")
);

// ---- Static: Connect page wiring ----
check(
  "Connect page imports the Vanguard file import guide",
  files.connectPage.includes("VanguardFileImportGuide")
);
check(
  "Connect page renders the guide above the workbench",
  files.connectPage.indexOf("<VanguardFileImportGuide") <
    files.connectPage.indexOf("UniversalImportWorkbench accounts")
);
check(
  "import center anchor exists for the guide link",
  files.connectPage.includes('id="import-center"')
);

// ---- Static: OFX guided flow cross-links the fallback ----
check(
  "guided OFX flow points failures at the Connect page fallback",
  files.guided.includes('href="/connect"')
);

// ---- Static: styles, package, CI ----
check(
  "guide step styles exist",
  files.css.includes(".vanguard-file-steps")
);
check(
  "test:v212 script registered",
  typeof pkg.scripts?.["test:v212"] === "string" &&
    pkg.scripts["test:v212"].includes("test-v212")
);
check(
  "CI runs test:v212",
  files.buildYml.includes("npm run test:v212")
);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

console.log(
  `\ntest:v212 ${checks.length - failed}/${checks.length} checks passed`
);
process.exit(failed === 0 ? 0 : 1);
