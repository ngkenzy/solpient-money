import {
  mkdir,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const dockerEnv = ".env.local-db";
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
    dockerEnv,
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

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");
const filename =
  `solpient-money-${stamp}.sql.gz`;
const target = path.join(
  backupDir,
  filename
);

await writeFile(
  target,
  gzipSync(dump.stdout, {
    level: 9,
  }),
  { mode: 0o600 }
);

const files = (await readdir(backupDir))
  .filter(
    (name) =>
      name.startsWith(
        "solpient-money-"
      ) && name.endsWith(".sql.gz")
  )
  .sort()
  .reverse();

for (const stale of files.slice(30)) {
  await unlink(
    path.join(backupDir, stale)
  );
}

console.log(
  `Created encrypted-at-rest-by-Mac-filesystem backup artifact: backups/${filename}`
);
console.log(
  "Keep the backups directory on an encrypted Mac volume or encrypted external drive."
);
