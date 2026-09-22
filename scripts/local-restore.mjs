import {
  readFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const file = process.argv[2];
if (!file) {
  throw new Error(
    "Usage: npm run local:restore -- backups/<file>.sql.gz"
  );
}

const compressed = await readFile(file);
const sql = gunzipSync(compressed);

const restore = spawnSync(
  "docker",
  [
    "compose",
    "-f",
    "docker-compose.local.yml",
    "--env-file",
    ".env.local-db",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "solpient",
    "-d",
    "solpient",
  ],
  {
    input: sql,
    stdio: [
      "pipe",
      "inherit",
      "inherit",
    ],
  }
);

if (restore.status !== 0) {
  throw new Error(
    "Local PostgreSQL restore failed."
  );
}

console.log("Solpient Local restore completed.");
