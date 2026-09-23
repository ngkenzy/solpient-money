import { spawn, spawnSync } from "node:child_process";
import pg from "pg";

const LEGACY = "solpient-local-db-1";
const TARGET = "solpient-money-postgres";

function containerExists(name) {
  const result = spawnSync(
    "docker",
    ["inspect", "-f", "{{.State.Running}}", name],
    { encoding: "utf8" }
  );
  return {
    exists: result.status === 0,
    running:
      result.status === 0 &&
      result.stdout.trim() === "true",
  };
}

function queryContainer(container, sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "solpient",
      "-d",
      "solpient",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(
      `Query failed in ${container}: ${result.stderr || "unknown error"}`
    );
  }

  return result.stdout.trim();
}

async function pipeLegacyDump() {
  const dump = spawn(
    "docker",
    [
      "exec",
      "-i",
      LEGACY,
      "pg_dump",
      "-U",
      "solpient",
      "-d",
      "solpient",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const restore = spawn(
    "docker",
    [
      "exec",
      "-i",
      TARGET,
      "psql",
      "-U",
      "solpient",
      "-d",
      "solpient",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      stdio: ["pipe", "inherit", "inherit"],
    }
  );

  let dumpError = "";
  dump.stderr.on("data", (chunk) => {
    dumpError += chunk.toString();
  });

  dump.stdout.pipe(restore.stdin);

  const [dumpCode, restoreCode] = await Promise.all([
    new Promise((resolve) =>
      dump.on("close", (code) => resolve(code ?? 1))
    ),
    new Promise((resolve) =>
      restore.on("close", (code) => resolve(code ?? 1))
    ),
  ]);

  if (dumpCode !== 0) {
    throw new Error(
      `Legacy pg_dump failed: ${dumpError || "unknown error"}`
    );
  }

  if (restoreCode !== 0) {
    throw new Error(
      "Restore into canonical PostgreSQL failed. The legacy container was not modified."
    );
  }
}

if (!process.argv.includes("--confirm")) {
  console.log(
    "This command copies the legacy Solpient database into the canonical local database."
  );
  console.log(
    "It does NOT delete or modify solpient-local-db-1."
  );
  console.log("");
  console.log(
    "Run: npm run local:migrate-legacy -- --confirm"
  );
  process.exit(1);
}

const legacy = containerExists(LEGACY);
if (!legacy.exists) {
  throw new Error(
    `Legacy container ${LEGACY} was not found. Nothing to migrate.`
  );
}

if (!legacy.running) {
  const start = spawnSync(
    "docker",
    ["start", LEGACY],
    { stdio: "inherit" }
  );
  if (start.status !== 0) {
    throw new Error(
      `Unable to start legacy container ${LEGACY}.`
    );
  }
}

console.log("Preparing canonical PostgreSQL...");

const cleanEnv = { ...process.env };
delete cleanEnv.DATABASE_URL;

const repair = spawnSync(
  process.execPath,
  ["scripts/local-setup.mjs"],
  {
    stdio: "inherit",
    env: cleanEnv,
  }
);

if (repair.status !== 0) {
  throw new Error(
    "Canonical local database could not be prepared."
  );
}

const target = containerExists(TARGET);
if (!target.running) {
  throw new Error(
    `Canonical container ${TARGET} is not running.`
  );
}

const legacyHouseholds = Number(
  queryContainer(
    LEGACY,
    "select case when to_regclass('public.households') is null then 0 else (select count(*) from public.households) end;"
  ) || 0
);

const targetHouseholds = Number(
  queryContainer(
    TARGET,
    "select case when to_regclass('public.households') is null then 0 else (select count(*) from public.households) end;"
  ) || 0
);

if (targetHouseholds > 0) {
  throw new Error(
    `Canonical database already contains ${targetHouseholds} household row(s). Migration stopped to avoid overwriting data. The legacy database is unchanged.`
  );
}

console.log(
  `Legacy database contains ${legacyHouseholds} household row(s).`
);
console.log(
  "Copying legacy PostgreSQL database into canonical local PostgreSQL..."
);

await pipeLegacyDump();

console.log("Applying any migrations added after the legacy database snapshot...");

const migrate = spawnSync(
  process.execPath,
  ["scripts/local-db-init.mjs"],
  {
    stdio: "inherit",
    env: cleanEnv,
  }
);

if (migrate.status !== 0) {
  throw new Error(
    "Legacy data restored, but current migrations did not complete. The legacy source remains untouched."
  );
}

const finalHouseholds = Number(
  queryContainer(
    TARGET,
    "select count(*) from public.households;"
  ) || 0
);

if (finalHouseholds !== legacyHouseholds) {
  throw new Error(
    `Household verification mismatch after migration: legacy=${legacyHouseholds}, canonical=${finalHouseholds}. The legacy source remains untouched.`
  );
}

const legacyAccounts = Number(
  queryContainer(
    LEGACY,
    "select case when to_regclass('public.accounts') is null then 0 else (select count(*) from public.accounts) end;"
  ) || 0
);
const finalAccounts = Number(
  queryContainer(
    TARGET,
    "select count(*) from public.accounts;"
  ) || 0
);

if (legacyAccounts !== finalAccounts) {
  throw new Error(
    `Account verification mismatch after migration: legacy=${legacyAccounts}, canonical=${finalAccounts}. The legacy source remains untouched.`
  );
}

console.log("");
console.log("✓ Legacy data copied to canonical PostgreSQL");
console.log(`✓ Household rows verified: ${finalHouseholds}`);
console.log(`✓ Account rows verified: ${finalAccounts}`);
console.log("✓ Current migrations applied");
console.log(`✓ Legacy container preserved: ${LEGACY}`);
console.log("");
console.log(
  "Run 'npm run local:doctor'. If everything is healthy, use 'npm run dev'."
);
