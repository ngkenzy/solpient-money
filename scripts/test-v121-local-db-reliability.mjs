import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  setup: await readFile("scripts/local-setup.mjs", "utf8"),
  doctor: await readFile("scripts/local-doctor.mjs", "utf8"),
  dev: await readFile("scripts/local-dev.mjs", "utf8"),
  legacy: await readFile("scripts/local-migrate-legacy.mjs", "utf8"),
  config: await readFile("lib/local-db/config.ts", "utf8"),
  client: await readFile("lib/local-db/client.ts", "utf8"),
  compose: await readFile("docker-compose.local.yml", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast121(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  if (major > 1) return true;
  if (major < 1) return false;
  if (minor > 2) return true;
  if (minor < 2) return false;
  return patch >= 1;
}

const checks = [
  ["release includes V1.2.1 or newer", atLeast121(pkg.version)],
  ["npm dev uses local preflight wrapper", pkg.scripts?.dev === "node scripts/local-dev.mjs"],
  ["local repair command exists", pkg.scripts?.["local:repair"] === "node scripts/local-setup.mjs"],
  ["local doctor command exists", pkg.scripts?.["local:doctor"] === "node scripts/local-doctor.mjs"],
  ["legacy migration command exists", pkg.scripts?.["local:migrate-legacy"] === "node scripts/local-migrate-legacy.mjs"],
  ["canonical compose binds loopback 5432", files.compose.includes('"127.0.0.1:5432:5432"')],
  ["canonical container name is stable", files.compose.includes("container_name: solpient-money-postgres")],
  ["setup writes canonical 5432 DATABASE_URL", files.setup.includes('const PORT = "5432"') && files.setup.includes("canonicalUrl(password)")],
  ["setup synchronizes actual PostgreSQL role password", files.setup.includes("ALTER ROLE") && files.setup.includes("synchronize")],
  ["setup verifies TCP authentication after synchronization", files.setup.includes("await verifyTcp(databaseUrl)")],
  ["setup keeps env files password-aligned", files.setup.includes("POSTGRES_PASSWORD") && files.setup.includes('nextEnv = upsertEnv(nextEnv, "DATABASE_URL", databaseUrl)')],
  ["doctor compares env passwords", files.doctor.includes("Env passwords match")],
  ["doctor checks canonical container", files.doctor.includes("solpient-money-postgres")],
  ["doctor detects legacy container without deleting it", files.doctor.includes("solpient-local-db-1") && !files.doctor.includes("docker rm")],
  ["doctor diagnoses PostgreSQL 28P01", files.doctor.includes('code === "28P01"') && files.doctor.includes("npm run local:repair")],
  ["dev wrapper rejects legacy configuration", files.dev.includes("Legacy or non-canonical local DATABASE_URL detected")],
  ["dev wrapper runs doctor before Next", files.dev.indexOf("local-doctor.mjs") < files.dev.indexOf("node_modules/next/dist/bin/next")],
  ["dev wrapper overrides inherited DATABASE_URL", files.dev.includes("DATABASE_URL: databaseUrl")],
  ["legacy migration requires explicit confirmation", files.legacy.includes("--confirm")],
  ["legacy migration refuses non-empty canonical household data", files.legacy.includes("Canonical database already contains")],
  ["legacy migration uses pg_dump and psql", files.legacy.includes("pg_dump") && files.legacy.includes('"psql"')],
  ["legacy migration preserves source container", files.legacy.includes("legacy source remains untouched") && !files.legacy.includes("docker rm")],
  ["legacy migration clears inherited DATABASE_URL", files.legacy.includes("delete cleanEnv.DATABASE_URL")],
  ["runtime config rejects non-canonical local DB", files.config.includes("127.0.0.1:5432") && files.config.includes("npm run local:repair")],
  ["runtime auth failure gives actionable repair command", files.client.includes("Solpient Local PostgreSQL credential mismatch")],
  ["sidebar label shows V1.2.1", files.shell.includes("MONEY V1.2.1")],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.2.1 Local DB Reliability invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.2.1 Local DB Reliability invariants passed.");
