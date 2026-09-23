import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const LEGACY = "solpient-local-db-1";
const TARGET = "solpient-money-postgres";
const DATABASE = "solpient";
const USER = "solpient";

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

function queryContainer(
  container,
  sql,
  database = DATABASE
) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      USER,
      "-d",
      database,
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
      `Query failed in ${container}/${database}: ${result.stderr || "unknown error"}`
    );
  }

  return result.stdout.trim();
}

function scalarCount(container, table) {
  return Number(
    queryContainer(
      container,
      `select case when to_regclass('public.${table}') is null then 0 else (select count(*) from public.${table}) end;`
    ) || 0
  );
}

function recreateEmptyCanonicalDatabase() {
  console.log(
    "Recreating the empty canonical database before legacy restore..."
  );

  const terminate = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      TARGET,
      "psql",
      "-U",
      USER,
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = '${DATABASE}'
          and pid <> pg_backend_pid();

        drop database if exists ${DATABASE};
        create database ${DATABASE} owner ${USER};
      `,
      encoding: "utf8",
    }
  );

  if (terminate.status !== 0) {
    throw new Error(
      `Unable to recreate the empty canonical database: ${terminate.stderr || "unknown error"}`
    );
  }
}

async function createLegacyDumpFile() {
  const dir = await mkdtemp(
    path.join(tmpdir(), "solpient-legacy-")
  );
  const dumpPath = path.join(dir, "legacy.sql");

  console.log(
    "Creating a temporary legacy PostgreSQL dump..."
  );

  const dump = spawn(
    "docker",
    [
      "exec",
      "-i",
      LEGACY,
      "pg_dump",
      "-U",
      USER,
      "-d",
      DATABASE,
      "--no-owner",
      "--no-privileges",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let stderr = "";
  dump.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const dumpDone = new Promise((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Legacy pg_dump failed: ${stderr || `exit code ${code}`}`
          )
        );
      }
    });
  });

  await Promise.all([
    pipeline(dump.stdout, createWriteStream(dumpPath)),
    dumpDone,
  ]);

  return {
    dir,
    dumpPath,
  };
}

async function restoreLegacyDumpFile(dumpPath) {
  console.log(
    "Restoring legacy data into the fresh canonical database..."
  );

  const restore = spawn(
    "docker",
    [
      "exec",
      "-i",
      TARGET,
      "psql",
      "-U",
      USER,
      "-d",
      DATABASE,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      stdio: ["pipe", "inherit", "pipe"],
    }
  );

  let stderr = "";
  restore.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const restoreDone = new Promise((resolve, reject) => {
    restore.on("error", reject);
    restore.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Legacy restore failed: ${stderr || `exit code ${code}`}`
          )
        );
      }
    });
  });

  try {
    await Promise.all([
      pipeline(createReadStream(dumpPath), restore.stdin),
      restoreDone,
    ]);
  } catch (error) {
    if (!restore.killed) {
      restore.kill("SIGTERM");
    }
    throw error;
  }
}

if (!process.argv.includes("--confirm")) {
  console.log(
    "This command copies the legacy Solpient database into the canonical local database."
  );
  console.log(
    `It does NOT delete or modify ${LEGACY}.`
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

const legacyHouseholds = scalarCount(
  LEGACY,
  "households"
);
const legacyAccounts = scalarCount(
  LEGACY,
  "accounts"
);
const legacyTransactions = scalarCount(
  LEGACY,
  "transactions"
);
const targetHouseholds = scalarCount(
  TARGET,
  "households"
);

if (targetHouseholds > 0) {
  throw new Error(
    `Canonical database already contains ${targetHouseholds} household row(s). Migration stopped to avoid overwriting data. The legacy database is unchanged.`
  );
}

console.log(
  `Legacy database contains ${legacyHouseholds} household row(s), ${legacyAccounts} account row(s), and ${legacyTransactions} transaction row(s).`
);

let temporary = null;

try {
  temporary = await createLegacyDumpFile();

  // The canonical DB currently contains the newest schema. Restoring an
  // older --clean dump into it can fail when newer FK dependencies exist.
  // Recreate only the empty target DB, restore the old snapshot first,
  // then roll it forward using the current migration runner.
  recreateEmptyCanonicalDatabase();

  await restoreLegacyDumpFile(
    temporary.dumpPath
  );

  console.log(
    "Applying migrations added after the legacy database snapshot..."
  );

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

  const finalHouseholds = scalarCount(
    TARGET,
    "households"
  );
  const finalAccounts = scalarCount(
    TARGET,
    "accounts"
  );
  const finalTransactions = scalarCount(
    TARGET,
    "transactions"
  );

  if (finalHouseholds !== legacyHouseholds) {
    throw new Error(
      `Household verification mismatch after migration: legacy=${legacyHouseholds}, canonical=${finalHouseholds}. The legacy source remains untouched.`
    );
  }

  if (finalAccounts !== legacyAccounts) {
    throw new Error(
      `Account verification mismatch after migration: legacy=${legacyAccounts}, canonical=${finalAccounts}. The legacy source remains untouched.`
    );
  }

  if (finalTransactions !== legacyTransactions) {
    throw new Error(
      `Transaction verification mismatch after migration: legacy=${legacyTransactions}, canonical=${finalTransactions}. The legacy source remains untouched.`
    );
  }

  console.log("");
  console.log("✓ Legacy data copied to canonical PostgreSQL");
  console.log(
    `✓ Household rows verified: ${finalHouseholds}`
  );
  console.log(
    `✓ Account rows verified: ${finalAccounts}`
  );
  console.log(
    `✓ Transaction rows verified: ${finalTransactions}`
  );
  console.log("✓ Current migrations applied");
  console.log(
    `✓ Legacy container preserved: ${LEGACY}`
  );
  console.log("");
  console.log(
    "Run 'npm run local:doctor'. If everything is healthy, use 'npm run dev'."
  );
} finally {
  if (temporary?.dir) {
    await rm(temporary.dir, {
      recursive: true,
      force: true,
    });
  }
}
