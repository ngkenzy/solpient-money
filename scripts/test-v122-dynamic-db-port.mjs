import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  setup: await readFile("scripts/local-setup.mjs", "utf8"),
  doctor: await readFile("scripts/local-doctor.mjs", "utf8"),
  dev: await readFile("scripts/local-dev.mjs", "utf8"),
  config: await readFile("lib/local-db/config.ts", "utf8"),
  compose: await readFile("docker-compose.local.yml", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast122(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  if (major > 1) return true;
  if (major < 1) return false;
  if (minor > 2) return true;
  if (minor < 2) return false;
  return patch >= 2;
}

const checks = [
  ["release includes V1.2.2 or newer", atLeast122(pkg.version)],
  ["compose host port is configurable", files.compose.includes("SOLPIENT_DB_PORT:-55433")],
  ["setup has dedicated default port", files.setup.includes("DEFAULT_PORT = 55433")],
  ["setup scans a Solpient port range", files.setup.includes("MAX_PORT = 55449")],
  ["setup can test host-port availability", files.setup.includes("isPortAvailable") && files.setup.includes("createServer")],
  ["setup reuses a running canonical container port", files.setup.includes("container.running") && files.setup.includes("container.hostPort")],
  ["setup persists selected port to Docker env", files.setup.includes('"SOLPIENT_DB_PORT",\n  String(port)')],
  ["setup persists selected port to Next env", files.setup.includes('nextEnv = upsertEnv(\n  nextEnv,\n  "SOLPIENT_DB_PORT"')],
  ["setup force-recreates container when mapping changes", files.setup.includes('"--force-recreate"')],
  ["doctor compares URL and both persisted ports", files.doctor.includes("Database port is synchronized")],
  ["doctor can surface a host-port owner", files.doctor.includes("portOwner(port)") && files.doctor.includes("lsof")],
  ["dev preflight reads persisted port", files.dev.includes('readKey(envFile, "SOLPIENT_DB_PORT")')],
  ["dev passes selected port to Next", files.dev.includes("SOLPIENT_DB_PORT: String(expectedPort)")],
  ["runtime validation uses selected port", files.config.includes("process.env.SOLPIENT_DB_PORT")],
  ["sidebar label shows V1.2.2", files.shell.includes("MONEY V1.2.2")],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.2.2 Dynamic DB Port invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.2.2 Dynamic DB Port invariants passed.");
