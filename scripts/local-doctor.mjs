import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";

const NEXT_ENV = ".env.local";
const DOCKER_ENV = ".env.local-db";
const EXPECTED = {
  host: "127.0.0.1",
  database: "solpient",
  user: "solpient",
  container: "solpient-money-postgres",
};

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function readKey(content, key) {
  const line = content
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : null;
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 1024 && parsed < 65536
    ? parsed
    : null;
}

function pass(label, detail = "") {
  console.log(`✓ ${label}${detail ? `: ${detail}` : ""}`);
}

function warn(label, detail = "") {
  console.log(`! ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail = "") {
  console.log(`✗ ${label}${detail ? `: ${detail}` : ""}`);
  failures.push(label);
}

function portOwner(port) {
  const result = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
    { encoding: "utf8" }
  );

  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout
      .trim()
      .split(/\r?\n/)
      .slice(0, 4)
      .join(" | ");
  }

  return null;
}

const failures = [];

console.log("Solpient Local Doctor");
console.log("=====================");

const docker = spawnSync(
  "docker",
  ["version", "--format", "{{.Server.Version}}"],
  { encoding: "utf8" }
);

if (docker.status !== 0) {
  fail("Docker running", "Docker daemon is unavailable");
} else {
  pass("Docker running", docker.stdout.trim());
}

let dockerPassword = null;
let dockerPort = null;

if (!(await exists(DOCKER_ENV))) {
  fail(".env.local-db exists");
} else {
  const dockerEnv = await readFile(DOCKER_ENV, "utf8");
  dockerPassword = readKey(dockerEnv, "POSTGRES_PASSWORD");
  dockerPort = parsePort(readKey(dockerEnv, "SOLPIENT_DB_PORT"));

  if (dockerPassword) {
    pass(".env.local-db has POSTGRES_PASSWORD");
  } else {
    fail(".env.local-db has POSTGRES_PASSWORD");
  }

  if (dockerPort) {
    pass(".env.local-db has SOLPIENT_DB_PORT", String(dockerPort));
  } else {
    fail(
      ".env.local-db has SOLPIENT_DB_PORT",
      "run npm run local:repair to select a dedicated port"
    );
  }
}

let databaseUrl = null;
let parsed = null;
let nextPort = null;

if (!(await exists(NEXT_ENV))) {
  fail(".env.local exists");
} else {
  const nextEnv = await readFile(NEXT_ENV, "utf8");
  databaseUrl = readKey(nextEnv, "DATABASE_URL");
  nextPort = parsePort(readKey(nextEnv, "SOLPIENT_DB_PORT"));

  if (!databaseUrl) {
    fail(".env.local has DATABASE_URL");
  } else {
    pass(".env.local has DATABASE_URL");

    try {
      parsed = new URL(databaseUrl);

      if (parsed.hostname === EXPECTED.host) {
        pass("Database host", EXPECTED.host);
      } else {
        fail(
          "Database host",
          `expected ${EXPECTED.host}, found ${parsed.hostname}`
        );
      }

      const urlPort = parsePort(parsed.port || "5432");
      if (dockerPort && urlPort === dockerPort && nextPort === dockerPort) {
        pass("Database port is synchronized", String(dockerPort));
      } else {
        fail(
          "Database port is synchronized",
          `.env.local-db=${dockerPort ?? "missing"}, .env.local=${nextPort ?? "missing"}, DATABASE_URL=${urlPort ?? "invalid"}`
        );
      }

      const database = parsed.pathname.replace(/^\//, "");
      if (database === EXPECTED.database) {
        pass("Database name", EXPECTED.database);
      } else {
        fail(
          "Database name",
          `expected ${EXPECTED.database}, found ${database}`
        );
      }

      if (decodeURIComponent(parsed.username) === EXPECTED.user) {
        pass("Database user", EXPECTED.user);
      } else {
        fail(
          "Database user",
          `expected ${EXPECTED.user}, found ${decodeURIComponent(parsed.username)}`
        );
      }

      const urlPassword = decodeURIComponent(parsed.password);
      if (dockerPassword && urlPassword === dockerPassword) {
        pass("Env passwords match");
      } else if (dockerPassword) {
        fail(
          "Env passwords match",
          ".env.local and .env.local-db contain different credentials"
        );
      }
    } catch (error) {
      fail(
        "DATABASE_URL parses",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

if (process.env.DATABASE_URL?.trim()) {
  if (databaseUrl && process.env.DATABASE_URL.trim() !== databaseUrl) {
    warn(
      "Shell DATABASE_URL differs from .env.local",
      "npm run dev overrides it; run 'unset DATABASE_URL' to clean your shell"
    );
  } else {
    pass("Shell DATABASE_URL does not conflict");
  }
} else {
  pass("No conflicting shell DATABASE_URL");
}

if (docker.status === 0) {
  const names = spawnSync(
    "docker",
    ["ps", "-a", "--format", "{{.Names}}"],
    { encoding: "utf8" }
  );

  const containers =
    names.status === 0
      ? names.stdout.split(/\r?\n/).filter(Boolean)
      : [];

  if (containers.includes(EXPECTED.container)) {
    const running = spawnSync(
      "docker",
      ["inspect", "-f", "{{.State.Running}}", EXPECTED.container],
      { encoding: "utf8" }
    );

    const isRunning =
      running.status === 0 && running.stdout.trim() === "true";

    if (isRunning) {
      pass("Canonical container running", EXPECTED.container);
    } else {
      fail("Canonical container running", EXPECTED.container);
    }

    const port = spawnSync(
      "docker",
      ["port", EXPECTED.container, "5432/tcp"],
      { encoding: "utf8" }
    );
    const binding = port.stdout.trim();

    if (
      dockerPort &&
      port.status === 0 &&
      binding.includes(`127.0.0.1:${dockerPort}`)
    ) {
      pass("Canonical port binding", binding);
    } else {
      fail(
        "Canonical port binding",
        binding ||
          `5432/tcp is not bound to 127.0.0.1:${dockerPort ?? "unknown"}`
      );
    }
  } else {
    fail("Canonical container exists", EXPECTED.container);

    if (dockerPort) {
      const owner = portOwner(dockerPort);
      if (owner) {
        warn(
          `Configured host port ${dockerPort} is already in use`,
          owner
        );
      } else {
        pass(
          `Configured host port ${dockerPort} appears available`
        );
      }
    }
  }

  if (containers.includes("solpient-local-db-1")) {
    warn(
      "Legacy database container detected",
      "solpient-local-db-1 is preserved; use npm run local:migrate-legacy -- --confirm before retiring it"
    );
  } else {
    pass("No legacy solpient-local-db-1 container detected");
  }
}

if (databaseUrl && parsed && failures.length === 0) {
  const { Client } = pg;
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const result = await client.query(`
      select
        current_database() as database,
        current_user as "user",
        to_regclass('public.financial_plan_snapshots') is not null as v12_snapshots,
        to_regclass('public.money_autopilot_runs') is not null as autopilot_ledger,
        to_regclass('public.money_action_items') is not null as action_center,
        to_regclass('public.local_migrations') is not null as migration_table
    `);

    const row = result.rows[0];

    if (
      row?.database === EXPECTED.database &&
      row?.user === EXPECTED.user
    ) {
      pass("TCP password authentication verified");
    } else {
      fail(
        "TCP password authentication verified",
        JSON.stringify(row)
      );
    }

    if (row?.migration_table === true) {
      const count = await client.query(
        "select count(*)::int as count from public.local_migrations"
      );
      pass(
        "Migration registry present",
        `${count.rows[0]?.count ?? 0} applied`
      );
    } else {
      fail("Migration registry present");
    }

    if (row?.v12_snapshots === true) {
      pass("V1.2 monitoring schema present");
    } else {
      fail("V1.2 monitoring schema present");
    }

    if (row?.autopilot_ledger === true) {
      pass("V1.3 Autopilot ledger present");
    } else {
      fail("V1.3 Autopilot ledger present");
    }

    if (row?.action_center === true) {
      pass("V1.4 Action Center present");
    } else {
      fail("V1.4 Action Center present");
    }
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";

    if (code === "28P01") {
      fail(
        "TCP password authentication verified",
        "actual PostgreSQL role password differs from env files; run npm run local:repair"
      );
    } else {
      fail(
        "TCP password authentication verified",
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    await client.end().catch(() => {});
  }
}

console.log("");

if (failures.length) {
  console.log(
    `Doctor found ${failures.length} blocking issue(s). Run: npm run local:repair`
  );
  process.exitCode = 1;
} else {
  console.log("✓ Solpient Local database is healthy.");
}
