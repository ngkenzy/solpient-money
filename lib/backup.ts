import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  spawnSync,
} from "node:child_process";
import {
  mkdir,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  gunzipSync,
  gzipSync,
} from "node:zlib";

/**
 * Shared encrypted backup logic for the local PostgreSQL database.
 *
 * Artifact format (identical to scripts/local-backup.mjs):
 *   "SOLPIENT1" magic (9 bytes, ascii)
 *   | 12-byte IV
 *   | 16-byte AES-256-GCM auth tag
 *   | ciphertext of gzip(pg_dump --clean --if-exists --no-owner --no-privileges)
 */

export const BACKUP_MAGIC = "SOLPIENT1";

const BACKUP_PREFIX = "solpient-money-";
const BACKUP_SUFFIX = ".sql.gz.enc";
const BACKUP_RETENTION = 30;

const COMPOSE_BASE_ARGS = [
  "compose",
  "-f",
  "docker-compose.local.yml",
  "--env-file",
  ".env.local-db",
] as const;

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

export function getBackupKey(): Buffer {
  const keyValue =
    process.env.SOLPIENT_BACKUP_ENCRYPTION_KEY?.trim();
  if (!keyValue) {
    throw new Error(
      "Backup encryption key is missing."
    );
  }
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32) {
    throw new Error(
      "Backup encryption key is invalid."
    );
  }
  return key;
}

function pgDump(): Buffer {
  const dump = spawnSync(
    "docker",
    [
      ...COMPOSE_BASE_ARGS,
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
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 512,
    }
  );

  if (dump.error || dump.status !== 0) {
    const detail = dump.error
      ? `${dump.error.name}: ${dump.error.message}`
      : `exit status ${String(dump.status)}`;
    const stderr =
      dump.stderr?.toString("utf8") ||
      "no stderr output";
    throw new Error(
      `Database backup failed (${detail}): ${stderr}`
    );
  }
  return dump.stdout;
}

export function encryptBackupArtifact(
  sql: Buffer,
  key: Buffer
): Buffer {
  const compressed = gzipSync(sql, { level: 9 });
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
  return Buffer.concat([
    Buffer.from(BACKUP_MAGIC, "ascii"),
    iv,
    tag,
    ciphertext,
  ]);
}

/**
 * Verify the artifact header and authentication tag, then return the
 * raw SQL dump. Throws BackupValidationError for foreign or tampered
 * files — always call this BEFORE touching the live database.
 */
export function decryptBackupArtifact(
  artifact: Buffer,
  key: Buffer
): Buffer {
  if (
    artifact.subarray(0, BACKUP_MAGIC.length)
      .toString("ascii") !== BACKUP_MAGIC
  ) {
    throw new BackupValidationError(
      "This file is not a Solpient encrypted backup."
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

  let compressed: Buffer;
  try {
    compressed = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw new BackupValidationError(
      "Backup authentication failed. The file is damaged or the backup key is incorrect."
    );
  }
  return gunzipSync(compressed);
}

function backupDir(): string {
  return path.join(process.cwd(), "backups");
}

export function backupFilename(
  date = new Date()
): string {
  const stamp = date
    .toISOString()
    .replace(/[:.]/g, "-");
  return `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
}

async function persistBackup(
  filename: string,
  artifact: Buffer
): Promise<void> {
  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), artifact, {
    mode: 0o600,
  });

  const files = (await readdir(dir))
    .filter(
      (name) =>
        name.startsWith(BACKUP_PREFIX) &&
        name.endsWith(BACKUP_SUFFIX)
    )
    .sort()
    .reverse();

  for (const stale of files.slice(BACKUP_RETENTION)) {
    await unlink(path.join(dir, stale));
  }
}

/**
 * Dump, encrypt, and persist a backup. Returns the filename and the
 * artifact bytes (so callers can also offer it as a download).
 */
export async function createEncryptedBackup(): Promise<{
  filename: string;
  artifact: Buffer;
}> {
  const key = getBackupKey();
  const artifact = encryptBackupArtifact(
    pgDump(),
    key
  );
  const filename = backupFilename();
  await persistBackup(filename, artifact);
  return { filename, artifact };
}

/**
 * Decrypt-and-verify first, then replay the SQL into PostgreSQL.
 * A validation failure never touches the live database.
 */
export function restoreBackupArtifact(
  artifact: Buffer
): void {
  const key = getBackupKey();
  const sql = decryptBackupArtifact(artifact, key);

  const restore = spawnSync(
    "docker",
    [
      ...COMPOSE_BASE_ARGS,
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
      stdio: ["pipe", "ignore", "pipe"],
      encoding: "buffer",
    }
  );

  if (restore.error || restore.status !== 0) {
    const stderr =
      restore.stderr?.toString("utf8") ||
      "no stderr output";
    throw new Error(
      `Database restore failed: ${stderr}`
    );
  }
}
