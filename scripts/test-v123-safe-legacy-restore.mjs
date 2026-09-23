import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  setup: await readFile("scripts/local-setup.mjs", "utf8"),
  legacy: await readFile("scripts/local-migrate-legacy.mjs", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast123(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  if (major > 1) return true;
  if (major < 1) return false;
  if (minor > 2) return true;
  if (minor < 2) return false;
  return patch >= 3;
}

const checks = [
  ["release includes V1.2.3 or newer", atLeast123(pkg.version)],
  ["setup supports container-only repair", files.setup.includes("--container-only")],
  ["container-only repair skips migrations", files.setup.includes("schema migration intentionally skipped")],
  ["legacy migration uses container-only repair", files.legacy.includes('"--container-only"')],
  ["legacy restore no longer uses --clean", !files.legacy.includes('"--clean"')],
  ["legacy restore recreates only empty canonical DB", files.legacy.includes("drop database if exists") && files.legacy.includes("create database")],
  ["legacy restore checks canonical households before reset", files.legacy.indexOf("targetHouseholds > 0") < files.legacy.indexOf("recreateEmptyCanonicalDatabase()")],
  ["legacy dump is staged to a temporary file", files.legacy.includes("mkdtemp") && files.legacy.includes("legacy.sql")],
  ["legacy restore uses stream pipeline safely", files.legacy.includes("pipeline(createReadStream(dumpPath), restore.stdin)")],
  ["legacy dump excludes owner and privileges", files.legacy.includes("--no-owner") && files.legacy.includes("--no-privileges")],
  ["current migrations run after legacy restore", files.legacy.indexOf("restoreLegacyDumpFile") < files.legacy.indexOf('["scripts/local-db-init.mjs"]')],
  ["households are verified", files.legacy.includes("Household verification mismatch")],
  ["accounts are verified", files.legacy.includes("Account verification mismatch")],
  ["transactions are verified", files.legacy.includes("Transaction verification mismatch")],
  ["legacy source remains untouched", files.legacy.includes("legacy source remains untouched") && !files.legacy.includes("docker rm")],
  ["temporary dump is cleaned up", files.legacy.includes("rm(temporary.dir")],
  ["sidebar label shows V1.2.3", files.shell.includes("MONEY V1.2.3")],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.2.3 Safe Legacy Restore invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.2.3 Safe Legacy Restore invariants passed.");
