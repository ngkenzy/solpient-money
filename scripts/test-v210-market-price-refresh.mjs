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

const {
  normalizeTicker,
  parseYahooChartQuote,
} = await import("../lib/market-prices.ts");

const files = {
  pricesLib: await readFile("lib/market-prices.ts", "utf8"),
  actions: await readFile("app/portfolio/actions.ts", "utf8"),
  button: await readFile(
    "app/portfolio/RefreshPricesButton.tsx",
    "utf8"
  ),
  portfolioPage: await readFile(
    "app/portfolio/page.tsx",
    "utf8"
  ),
  css: await readFile("app/globals.css", "utf8"),
  packageJson: await readFile("package.json", "utf8"),
  buildYml: await readFile(
    ".github/workflows/build.yml",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);
const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

const yahooPayload = {
  chart: {
    result: [
      {
        meta: {
          currency: "USD",
          symbol: "AAPL",
          regularMarketPrice: 341.07,
          regularMarketChangePercent: 1.533,
          regularMarketTime: 1790366401,
        },
      },
    ],
    error: null,
  },
};

check(
  "ticker normalization trims and uppercases",
  normalizeTicker(" aapl ") === "AAPL"
);
check(
  "ticker normalization keeps dotted symbols",
  normalizeTicker("brk.b") === "BRK.B"
);
check(
  "ticker normalization excludes TSP funds",
  normalizeTicker("TSP-C") === null
);
check(
  "ticker normalization rejects non-tickers",
  normalizeTicker("Cash sweep account") === null &&
    normalizeTicker("") === null
);

const quote = parseYahooChartQuote("AAPL", yahooPayload);
check(
  "chart parser extracts the market price",
  quote !== null && quote.price === 341.07
);
check(
  "chart parser extracts the day change percent",
  quote !== null && quote.changePct === 1.533
);
check(
  "chart parser converts market time to ISO",
  quote !== null &&
    typeof quote.asOf === "string" &&
    !Number.isNaN(Date.parse(quote.asOf))
);
check(
  "chart parser returns null without a quote",
  parseYahooChartQuote("NOPE", {
    chart: { result: [], error: null },
  }) === null
);
check(
  "chart parser returns null for a zero price",
  parseYahooChartQuote("NOPE", {
    chart: {
      result: [
        { meta: { regularMarketPrice: 0 } },
      ],
      error: null,
    },
  }) === null
);
check(
  "price lib hits the Yahoo chart endpoint",
  files.pricesLib.includes(
    "query1.finance.yahoo.com/v8/finance/chart"
  )
);
check(
  "price lib falls back to the second Yahoo host",
  files.pricesLib.includes(
    "query2.finance.yahoo.com"
  )
);
check(
  "portfolio actions export the refresh action",
  files.actions.includes(
    "export async function refreshMarketPrices"
  )
);
check(
  "refresh action updates holding prices and market values",
  files.actions.includes("market_value_cents") &&
    files.actions.includes("revalidatePath(path)") &&
    files.actions.includes('"/portfolio"')
);
check(
  "refresh action skips TSP holdings",
  files.actions.includes('startsWith("TSP-")')
);
check(
  "refresh action skips cash holdings",
  files.actions.includes('"cash"')
);
check(
  "refresh button calls the action and refreshes on success",
  files.button.includes("refreshMarketPrices") &&
    files.button.includes("router.refresh()")
);
check(
  "portfolio page renders the refresh button",
  files.portfolioPage.includes("RefreshPricesButton")
);
check(
  "refresh button has dedicated styles",
  files.css.includes(
    ".portfolio-refresh-prices-button"
  )
);
check(
  "package.json wires test:v210",
  pkg.scripts["test:v210"] ===
    "node scripts/test-v210-market-price-refresh.mjs"
);
check(
  "CI runs test:v210",
  files.buildYml.includes("npm run test:v210")
);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}
console.log(
  `\nv210: ${checks.length - failed}/${checks.length} checks passed`
);
process.exit(failed ? 1 : 0);
