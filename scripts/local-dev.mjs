import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";

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

const envFile = await readFile(".env.local", "utf8");
const databaseUrl = readKey(envFile, "DATABASE_URL");
const expectedPort = parsePort(
  readKey(envFile, "SOLPIENT_DB_PORT")
);

if (!databaseUrl || !expectedPort) {
  throw new Error(
    "Canonical local database settings are missing from .env.local. Run npm run local:repair."
  );
}

const parsed = new URL(databaseUrl);
const actualPort = parsePort(parsed.port || "5432");

if (
  parsed.hostname !== "127.0.0.1" ||
  actualPort !== expectedPort ||
  parsed.pathname !== "/solpient" ||
  decodeURIComponent(parsed.username) !== "solpient"
) {
  throw new Error(
    "Legacy or non-canonical local DATABASE_URL detected. Run npm run local:repair before starting Solpient."
  );
}

const doctor = spawnSync(
  process.execPath,
  ["scripts/local-doctor.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SOLPIENT_DB_PORT: String(expectedPort),
    },
  }
);

if (doctor.status !== 0) {
  process.exit(doctor.status ?? 1);
}

// Migrations are checksum-guarded and idempotent: pending .sql files in
// supabase/migrations apply here so `npm run dev` never runs against a
// stale schema. Fail-closed: a bad migration stops startup loudly.
const migrate = spawnSync(
  process.execPath,
  ["scripts/local-db-init.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SOLPIENT_DB_PORT: String(expectedPort),
    },
  }
);

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});

try {
  await client.connect();
  await client.query("select 1");
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";

  if (code === "28P01") {
    throw new Error(
      "PostgreSQL credential verification failed before Next.js startup. Run npm run local:repair."
    );
  }

  throw error;
} finally {
  await client.end().catch(() => {});
}

const next = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SOLPIENT_DB_PORT: String(expectedPort),
      SOLPIENT_LOCAL_MODE: "true",
    },
  }
);

process.exit(next.status ?? 0);
