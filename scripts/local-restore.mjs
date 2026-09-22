import {
  createDecipheriv,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be populated.
  }
}

const file = process.argv[2];
if (!file) {
  throw new Error(
    "Usage: npm run local:restore -- backups/<file>.sql.gz.enc"
  );
}

const keyValue =
  process.env.SOLPIENT_BACKUP_ENCRYPTION_KEY?.trim();
if (!keyValue) {
  throw new Error(
    "SOLPIENT_BACKUP_ENCRYPTION_KEY is missing."
  );
}
const key = Buffer.from(keyValue, "base64");
if (key.length !== 32) {
  throw new Error(
    "SOLPIENT_BACKUP_ENCRYPTION_KEY must decode to 32 bytes."
  );
}

const artifact = await readFile(file);
const magic = artifact
  .subarray(0, 9)
  .toString("ascii");
if (magic !== "SOLPIENT1") {
  throw new Error(
    "Backup format is not a Solpient encrypted backup."
  );
}

const iv = artifact.subarray(9, 21);
const tag = artifact.subarray(21, 37);
const ciphertext = artifact.subarray(37);

const decipher = createDecipheriv(
  "aes-256-gcm",
  key,
  iv
);
decipher.setAuthTag(tag);

let compressed;
try {
  compressed = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
} catch {
  throw new Error(
    "Backup authentication failed. The file or backup encryption key is incorrect."
  );
}

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

console.log(
  "Solpient Local encrypted restore completed."
);
