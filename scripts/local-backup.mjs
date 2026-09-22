import {
  createCipheriv,
  randomBytes,
} from "node:crypto";
import {
  mkdir,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be populated.
  }
}

const keyValue =
  process.env.SOLPIENT_BACKUP_ENCRYPTION_KEY?.trim();
if (!keyValue) {
  throw new Error(
    "SOLPIENT_BACKUP_ENCRYPTION_KEY is missing. Run npm run local:setup."
  );
}
const key = Buffer.from(keyValue, "base64");
if (key.length !== 32) {
  throw new Error(
    "SOLPIENT_BACKUP_ENCRYPTION_KEY must decode to 32 bytes."
  );
}

const backupDir = path.join(
  process.cwd(),
  "backups"
);
await mkdir(backupDir, {
  recursive: true,
});

const dump = spawnSync(
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
    encoding: null,
    maxBuffer: 1024 * 1024 * 512,
  }
);

if (dump.status !== 0) {
  throw new Error(
    `PostgreSQL backup failed: ${dump.stderr?.toString("utf8") ?? "unknown error"}`
  );
}

const compressed = gzipSync(dump.stdout, {
  level: 9,
});
const iv = randomBytes(12);
const cipher = createCipheriv(
  "aes-256-gcm",
  key,
  iv
);
const ciphertext = Buffer.concat([
  cipher.update(compressed),
  cipher.final(),
]);
const tag = cipher.getAuthTag();

// File format: SOLPIENT1 | 12-byte IV | 16-byte GCM tag | ciphertext
const artifact = Buffer.concat([
  Buffer.from("SOLPIENT1", "ascii"),
  iv,
  tag,
  ciphertext,
]);

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");
const filename =
  `solpient-money-${stamp}.sql.gz.enc`;
const target = path.join(
  backupDir,
  filename
);

await writeFile(target, artifact, {
  mode: 0o600,
});

const files = (await readdir(backupDir))
  .filter(
    (name) =>
      name.startsWith("solpient-money-") &&
      name.endsWith(".sql.gz.enc")
  )
  .sort()
  .reverse();

for (const stale of files.slice(30)) {
  await unlink(
    path.join(backupDir, stale)
  );
}

console.log(
  `Created encrypted backup: backups/${filename}`
);
console.log(
  "AES-256-GCM encryption verified by authentication tag on restore."
);
