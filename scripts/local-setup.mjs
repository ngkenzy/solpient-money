import { randomBytes } from "node:crypto";
import {
  access,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import pg from "pg";

const dockerEnvPath = ".env.local-db";
const nextEnvPath = ".env.local";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 55433;
const MAX_PORT = 55449;
const DATABASE = "solpient";
const USER = "solpient";
const CONTAINER = "solpient-money-postgres";

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

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const rows = content
    .split(/\r?\n/)
    .filter((item) => !item.startsWith(`${key}=`));
  rows.push(line);
  return (
    rows
      .filter((item, index, all) => item || index < all.length - 1)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 1024 && parsed < 65536
    ? parsed
    : null;
}

function canonicalUrl(password, port) {
  return `postgresql://${USER}:${encodeURIComponent(
    password
  )}@${HOST}:${port}/${DATABASE}`;
}

function composeArgs(...args) {
  return [
    "compose",
    "-f",
    "docker-compose.local.yml",
    "--env-file",
    dockerEnvPath,
    ...args,
  ];
}

function shellDatabaseUrlDiffers(expected) {
  const inherited = process.env.DATABASE_URL?.trim();
  return Boolean(inherited && inherited !== expected);
}

function inspectCanonicalContainer() {
  const state = spawnSync(
    "docker",
    ["inspect", "-f", "{{.State.Running}}", CONTAINER],
    { encoding: "utf8" }
  );

  if (state.status !== 0) {
    return {
      exists: false,
      running: false,
      hostPort: null,
    };
  }

  const port = spawnSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{(index (index .HostConfig.PortBindings "5432/tcp") 0).HostPort}}',
      CONTAINER,
    ],
    { encoding: "utf8" }
  );

  return {
    exists: true,
    running: state.stdout.trim() === "true",
    hostPort:
      port.status === 0 ? parsePort(port.stdout.trim()) : null,
  };
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen({
      host: HOST,
      port,
      exclusive: true,
    });
  });
}

async function chooseCanonicalPort({
  preferredPort,
  container,
}) {
  if (
    container.exists &&
    container.running &&
    container.hostPort
  ) {
    return {
      port: container.hostPort,
      reason: "running canonical container",
    };
  }

  const candidates = [];
  if (preferredPort) candidates.push(preferredPort);
  if (!candidates.includes(DEFAULT_PORT)) {
    candidates.push(DEFAULT_PORT);
  }

  for (let port = DEFAULT_PORT; port <= MAX_PORT; port += 1) {
    if (!candidates.includes(port)) candidates.push(port);
  }

  for (const port of candidates) {
    if (await isPortAvailable(port)) {
      return {
        port,
        reason:
          port === preferredPort
            ? "existing Solpient preference"
            : port === DEFAULT_PORT
              ? "Solpient default"
              : "next available Solpient port",
      };
    }
  }

  throw new Error(
    `No free Solpient local PostgreSQL port was found between ${DEFAULT_PORT} and ${MAX_PORT}. Run npm run local:doctor for port diagnostics.`
  );
}

async function verifyTcp(databaseUrl) {
  const { Client } = pg;
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  try {
    const result = await client.query(
      "select current_database() as database, current_user as user"
    );
    const row = result.rows[0];
    if (row?.database !== DATABASE || row?.user !== USER) {
      throw new Error(
        `Unexpected PostgreSQL identity: ${JSON.stringify(row)}`
      );
    }
  } finally {
    await client.end();
  }
}

const dockerVersion = spawnSync(
  "docker",
  ["version", "--format", "{{.Server.Version}}"],
  { encoding: "utf8" }
);

if (dockerVersion.status !== 0) {
  throw new Error(
    "Docker is not running. Start Docker Desktop, OrbStack, Colima, or another Docker-compatible runtime first."
  );
}

let dockerEnv = (await exists(dockerEnvPath))
  ? await readFile(dockerEnvPath, "utf8")
  : "";

let password = readKey(dockerEnv, "POSTGRES_PASSWORD");

if (!password) {
  password = randomBytes(32).toString("hex");
}

const container = inspectCanonicalContainer();
const preferredPort = parsePort(
  readKey(dockerEnv, "SOLPIENT_DB_PORT")
);
const selected = await chooseCanonicalPort({
  preferredPort,
  container,
});
const port = selected.port;

dockerEnv = upsertEnv(
  dockerEnv,
  "POSTGRES_PASSWORD",
  password
);
dockerEnv = upsertEnv(
  dockerEnv,
  "SOLPIENT_DB_PORT",
  String(port)
);

await writeFile(dockerEnvPath, dockerEnv, {
  mode: 0o600,
});

let nextEnv = (await exists(nextEnvPath))
  ? await readFile(nextEnvPath, "utf8")
  : "";

const databaseUrl = canonicalUrl(password, port);

nextEnv = upsertEnv(nextEnv, "DATABASE_URL", databaseUrl);
nextEnv = upsertEnv(
  nextEnv,
  "SOLPIENT_DB_PORT",
  String(port)
);
nextEnv = upsertEnv(nextEnv, "SOLPIENT_LOCAL_MODE", "true");

if (!readKey(nextEnv, "CONNECT_SECRET_ENCRYPTION_KEY")) {
  nextEnv = upsertEnv(
    nextEnv,
    "CONNECT_SECRET_ENCRYPTION_KEY",
    randomBytes(32).toString("base64")
  );
}

if (!readKey(nextEnv, "SOLPIENT_BACKUP_ENCRYPTION_KEY")) {
  nextEnv = upsertEnv(
    nextEnv,
    "SOLPIENT_BACKUP_ENCRYPTION_KEY",
    randomBytes(32).toString("base64")
  );
}

await writeFile(nextEnvPath, nextEnv, {
  mode: 0o600,
});

console.log("Starting canonical Solpient PostgreSQL...");
console.log(
  `Selected host port ${port} (${selected.reason}); PostgreSQL remains 5432 inside Docker.`
);

const up = spawnSync(
  "docker",
  composeArgs("up", "-d", "--force-recreate"),
  { stdio: "inherit" }
);

if (up.status !== 0) {
  throw new Error(
    `Unable to start the canonical local PostgreSQL container on ${HOST}:${port}. Run npm run local:doctor for diagnostics.`
  );
}

let ready = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const probe = spawnSync(
    "docker",
    composeArgs(
      "exec",
      "-T",
      "postgres",
      "pg_isready",
      "-U",
      USER,
      "-d",
      DATABASE
    ),
    { stdio: "ignore" }
  );

  if (probe.status === 0) {
    ready = true;
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

if (!ready) {
  throw new Error(
    "Canonical PostgreSQL did not become ready. Run npm run local:doctor."
  );
}

// POSTGRES_PASSWORD only initializes a new PostgreSQL data directory.
// Existing volumes keep the role password stored inside PostgreSQL.
// Explicitly synchronize the actual role every time setup/repair runs.
const escapedPassword = password.replaceAll("'", "''");
const synchronize = spawnSync(
  "docker",
  composeArgs(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    USER,
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1"
  ),
  {
    input: `ALTER ROLE ${USER} WITH PASSWORD '${escapedPassword}';\n`,
    encoding: "utf8",
  }
);

if (synchronize.status !== 0) {
  throw new Error(
    `Unable to synchronize the PostgreSQL role password: ${synchronize.stderr || "unknown error"}`
  );
}

try {
  await verifyTcp(databaseUrl);
} catch (error) {
  throw new Error(
    `Canonical TCP authentication verification failed after password synchronization: ${error instanceof Error ? error.message : String(error)}`
  );
}

const migrate = spawnSync(
  process.execPath,
  ["scripts/local-db-init.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SOLPIENT_DB_PORT: String(port),
      CONNECT_SECRET_ENCRYPTION_KEY:
        readKey(nextEnv, "CONNECT_SECRET_ENCRYPTION_KEY") ?? "",
    },
  }
);

if (migrate.status !== 0) {
  throw new Error("Local PostgreSQL migrations failed.");
}

await verifyTcp(databaseUrl);

console.log("");
console.log(`✓ Canonical PostgreSQL container: ${CONTAINER}`);
console.log(`✓ PostgreSQL endpoint: ${HOST}:${port}`);
console.log("✓ .env.local and .env.local-db use the same password");
console.log("✓ .env.local and .env.local-db use the same host port");
console.log("✓ Actual PostgreSQL role password synchronized");
console.log("✓ TCP authentication verified");
console.log("✓ Solpient migrations current");

if (shellDatabaseUrlDiffers(databaseUrl)) {
  console.log("");
  console.warn(
    "WARNING: your shell has a different exported DATABASE_URL. npm run dev overrides stale shell values with .env.local, but run 'unset DATABASE_URL' to clean the shell."
  );
}

console.log("");
console.log("Solpient Local is ready.");
console.log("Next: npm run local:doctor && npm run dev");
