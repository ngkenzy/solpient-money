import { readFile } from "node:fs/promises";

const files = {
  demo: await readFile("lib/demo-data.ts", "utf8"),
  intelligence: await readFile("lib/intelligence.ts", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  readme: await readFile("README.md", "utf8"),
};

const checks = [
  ["demo holdings do not contain synthetic researchScore", !files.demo.includes("researchScore")],
  ["demo holdings do not contain synthetic fairValue", !files.demo.includes("fairValue")],
  ["intelligence exports financial health", files.intelligence.includes("export function getFinancialHealth")],
  ["attention feed removed from intelligence", !files.intelligence.includes("getAttentionFeed")],
  ["README uses canonical repo name", files.readme.includes("ngkenzy/solpient-money.git")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
}
if (failed.length) {
  throw new Error(`V0.4 invariant failure: ${failed.map(([name]) => name).join(", ")}`);
}
