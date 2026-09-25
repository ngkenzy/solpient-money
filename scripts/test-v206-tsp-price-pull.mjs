import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  pricesLib: await readFile("lib/tsp-prices.ts", "utf8"),
  actions: await readFile("app/tsp/actions.ts", "utf8"),
  button: await readFile(
    "app/tsp/TspPullPricesButton.tsx",
    "utf8"
  ),
  tspPage: await readFile("app/tsp/page.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast310(version) {
  const [major = 0, minor = 0, patch = 0] =
    String(version)
      .split(".")
      .map(
        (value) => Number.parseInt(value, 10) || 0
      );

  return (
    major > 3 ||
    (major === 3 && minor >= 1)
  );
}

const checks = [
  [
    "release includes V3.1.0 or newer",
    atLeast310(pkg.version),
  ],
  [
    "price lib exports a profile-free latest-price fetcher",
    files.pricesLib.includes(
      "export async function fetchLatestOfficialTspPrices"
    ) &&
      files.pricesLib.includes("priceDate"),
  ],
  [
    "TSP actions export the one-click pull action",
    files.actions.includes(
      "export async function pullLatestTspPrices"
    ),
  ],
  [
    "pull action updates holding prices and market values",
    files.actions.includes(
      "market_value_cents"
    ) &&
      files.actions.includes(
        'revalidatePath("/tsp")'
      ),
  ],
  [
    "pull action matches imported funds by TSP ticker prefix",
    files.actions.includes(
      'startsWith("TSP-")'
    ),
  ],
  [
    "TSP page renders the pull-prices button",
    files.tspPage.includes(
      "TspPullPricesButton"
    ),
  ],
  [
    "button calls the pull action and refreshes on success",
    files.button.includes(
      "pullLatestTspPrices"
    ) && files.button.includes("router.refresh"),
  ],
];

let failed = 0;

for (const [name, ok] of checks) {
  if (ok) {
    console.log(`ok - ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL - ${name}`);
  }
}

if (failed) {
  console.error(
    `\n${failed} check(s) failed`
  );
  process.exit(1);
}

console.log("\nAll TSP price-pull checks passed.");
