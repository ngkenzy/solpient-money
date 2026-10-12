import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Transpile dependency-free TypeScript in memory so the test works on Node 20+.
async function loadModule(path) {
  const source = await readFile(path, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  return mod.exports;
}

const { buildFundOverview } = await loadModule("lib/fund-overview.ts");
const h = (ticker, kind, value, shares, costBasis) => ({
  ticker, kind, value, shares, costBasis, name: ticker,
  price: shares ? value / shares : 0, sector: "Other", dayChange: 0, ytdReturn: 0,
});
const dataset = {
  holdings: [
    h("PFE", "stock", 90, 3, 70),
    h("pfe", "stock", 10, 1, 8),
    h("VTI", "etf", 20, 1, 17),
    h("CASH", "cash", 5, 5, 5),
    h("INVALID", "stock", -25, 1, 10),
  ],
  accounts: [
    { type: "cash", balance: 500 },
    { type: "investment", balance: 100 },
  ],
  householdPlan: { singleStockReviewPct: 25, topThreeStockReviewPct: 45 },
};
const overview = buildFundOverview(dataset);
assert.equal(overview.investedValue, 125, "Do not add account balances or negative holdings");
assert.equal(overview.directStockValue, 100);
assert.equal(overview.positions.length, 3, "Aggregate duplicate ticker lots");
assert.equal(overview.biggestStock.ticker, "PFE");
assert.equal(overview.biggestStock.value, 100);
assert.equal(overview.biggestStock.shares, 4);
assert.equal(overview.biggestStock.costBasis, 78);
assert.equal(overview.biggestStock.weightPct, 80);
assert.equal(overview.topFiveDirectStockPct, 100);
assert.equal(overview.cashLikeHoldings, 5);
assert.equal(overview.brokerageCashAccounts, 500);
assert.equal(overview.biggestStockDown30Loss, 30);
assert.equal(overview.biggestStockDown30PortfolioPct, 24);
assert.equal(overview.concentrationAlerts.length, 2);

const empty = buildFundOverview({ ...dataset, holdings: [] });
assert.equal(empty.investedValue, 0);
assert.equal(empty.biggestStock, null);
assert.equal(empty.topFiveDirectStockPct, 0);
assert.equal(empty.concentrationAlerts.length, 0);

const { getFundResearchFeed } = await loadModule("lib/fund-research.ts");
const previous = process.env.SOLPIENT_FUND_REPO_DIR;
const dir = await mkdtemp(join(tmpdir(), "solpient-fund-test-"));
try {
  delete process.env.SOLPIENT_FUND_REPO_DIR;
  assert.equal((await getFundResearchFeed()).state, "not-connected");
  process.env.SOLPIENT_FUND_REPO_DIR = join(dir, "missing");
  assert.equal((await getFundResearchFeed()).state, "unavailable");
  await mkdir(join(dir, "recommendations/top-10"), { recursive: true });
  await writeFile(join(dir, "DIRECTION.md"),
    "# Direction\n\n**Last updated:** 2026-10-12\n\n## This week's focus\n- Validate holdings\n- Audit methods\n\n## Rules\n");
  await writeFile(join(dir, "recommendations/top-10/CURRENT.md"),
    "# Solpient Top 10\n**Status:** Research in progress\n## Canonical Top 10\n_Not published yet._\n");
  process.env.SOLPIENT_FUND_REPO_DIR = dir;
  const pending = await getFundResearchFeed();
  assert.equal(pending.state, "research-pending");
  assert.deepEqual(pending.focus, ["Validate holdings", "Audit methods"]);
  assert.equal(pending.candidates.length, 0, "Never invent a Top 10");
  await writeFile(join(dir, "recommendations/top-10/CURRENT.md"),
    "# Top 10\n**Status:** Published\n## Canonical Top 10\n| Rank | Ticker | Company | Thesis |\n| --- | --- | --- | --- |\n| 1 | PFE | Pfizer | Tested |\n| 2 | MSFT | Microsoft | Tested |\n\n## Methodology\n");
  const published = await getFundResearchFeed();
  assert.equal(published.state, "published");
  assert.deepEqual(published.candidates.map((c) => c.ticker), ["PFE", "MSFT"]);
} finally {
  if (previous === undefined) delete process.env.SOLPIENT_FUND_REPO_DIR;
  else process.env.SOLPIENT_FUND_REPO_DIR = previous;
  await rm(dir, { recursive: true, force: true });
}
console.log("Fund command center invariants passed.");
