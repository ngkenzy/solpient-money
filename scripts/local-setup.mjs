import { randomBytes } from "node:crypto";
import {
  access,
  readFile,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";

const dockerEnvPath = ".env.local-db";
const nextEnvPath = ".env.local";

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
    .find((item) =>
      item.startsWith(`${key}=`)
    );
  return line
    ? line.slice(key.length + 1).trim()
    : null;
}

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const rows = content
    .split(/\r?\n/)
    .filter(
      (item) =>
        !item.startsWith(`${key}=`)
    );
  rows.push(line);
  return rows
    .filter(
      (item, index, all) =>
        item || index < all.length - 1
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
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
let password = readKey(
  dockerEnv,
  "POSTGRES_PASSWORD"
);

if (!password) {
  password = randomBytes(32).toString("hex");
  dockerEnv = upsertEnv(
    dockerEnv,
    "POSTGRES_PASSWORD",
    password
  );
  await writeFile(
    dockerEnvPath,
    dockerEnv,
    { mode: 0o600 }
  );
}

let nextEnv = (await exists(nextEnvPath))
  ? await readFile(nextEnvPath, "utf8")
  : "";

const encodedPassword =
  encodeURIComponent(password);
const databaseUrl =
  `postgresql://solpient:${encodedPassword}@127.0.0.1:5432/solpient`;

nextEnv = upsertEnv(
  nextEnv,
  "DATABASE_URL",
  databaseUrl
);
nextEnv = upsertEnv(
  nextEnv,
  "SOLPIENT_LOCAL_MODE",
  "true"
);

if (
  !readKey(
    nextEnv,
    "CONNECT_SECRET_ENCRYPTION_KEY"
  )
) {
  nextEnv = upsertEnv(
    nextEnv,
    "CONNECT_SECRET_ENCRYPTION_KEY",
    randomBytes(32).toString("base64")
  );
}

if (
  !readKey(
    nextEnv,
    "SOLPIENT_BACKUP_ENCRYPTION_KEY"
  )
) {
  nextEnv = upsertEnv(
    nextEnv,
    "SOLPIENT_BACKUP_ENCRYPTION_KEY",
    randomBytes(32).toString("base64")
  );
}

await writeFile(nextEnvPath, nextEnv, {
  mode: 0o600,
});

console.log("Starting local PostgreSQL...");

const up = spawnSync(
  "docker",
  [
    "compose",
    "-f",
    "docker-compose.local.yml",
    "--env-file",
    dockerEnvPath,
    "up",
    "-d",
  ],
  { stdio: "inherit" }
);
if (up.status !== 0) {
  throw new Error(
    "Unable to start the local PostgreSQL container."
  );
}

let ready = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const probe = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "docker-compose.local.yml",
      "--env-file",
      dockerEnvPath,
      "exec",
      "-T",
      "postgres",
      "pg_isready",
      "-U",
      "solpient",
      "-d",
      "solpient",
    ],
    { stdio: "ignore" }
  );

  if (probe.status === 0) {
    ready = true;
    break;
  }

  await new Promise((resolve) =>
    setTimeout(resolve, 1000)
  );
}

if (!ready) {
  throw new Error(
    "PostgreSQL did not become ready."
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
      CONNECT_SECRET_ENCRYPTION_KEY:
        readKey(
          nextEnv,
          "CONNECT_SECRET_ENCRYPTION_KEY"
        ) ?? "",
    },
  }
);

if (migrate.status !== 0) {
  throw new Error(
    "Local PostgreSQL migrations failed."
  );
}

console.log("");
console.log("Solpient Local is ready.");
console.log(
  "PostgreSQL: 127.0.0.1:5432 (localhost only)"
);
console.log(
  "Secrets: .env.local and .env.local-db (gitignored)"
);
console.log(
  "Next: npm run dev"
);
