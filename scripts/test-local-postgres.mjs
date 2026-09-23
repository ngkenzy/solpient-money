import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";

async function allSourceText(dir) {
  const entries = await readdir(dir, {
    withFileTypes: true,
  });
  const parts = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        ["node_modules", ".next", ".git"].includes(
          entry.name
        )
      ) {
        continue;
      }
      parts.push(await allSourceText(full));
    } else if (
      /\.(ts|tsx|js|mjs)$/.test(entry.name)
    ) {
      parts.push(await readFile(full, "utf8"));
    }
  }
  return parts.join("\n");
}

const pkg = JSON.parse(
  await readFile("package.json", "utf8")
);
const compose = await readFile(
  "docker-compose.local.yml",
  "utf8"
);
const setup = await readFile(
  "scripts/local-setup.mjs",
  "utf8"
);
const migrate = await readFile(
  "scripts/local-db-init.mjs",
  "utf8"
);
const backup = await readFile(
  "scripts/local-backup.mjs",
  "utf8"
);
const restore = await readFile(
  "scripts/local-restore.mjs",
  "utf8"
);
const db = await readFile(
  "lib/local-db/client.ts",
  "utf8"
);
const proxy = await readFile(
  "proxy.ts",
  "utf8"
);
const appLibSource = [
  await allSourceText("app"),
  await allSourceText("lib"),
].join("\n");

const checks = [
  [
    "Solpient Local release is 0.8.0+",
    /^0\.(?:8|9)\./.test(pkg.version) ||
      /^[1-9]\./.test(pkg.version),
  ],
  [
    "Supabase runtime dependencies are gone",
    !pkg.dependencies?.["@supabase/ssr"] &&
      !pkg.dependencies?.["@supabase/supabase-js"],
  ],
  [
    "PostgreSQL driver is pinned",
    pkg.dependencies?.pg === "8.23.0",
  ],
  [
    "Postgres binds only to loopback",
    compose.includes(
      '"127.0.0.1:${SOLPIENT_DB_PORT:-55433}:5432"'
    ) &&
      !compose.includes(
        '"0.0.0.0:'
      ),
  ],
  [
    "Docker volume persists database",
    compose.includes(
      "solpient_postgres_data"
    ),
  ],
  [
    "setup generates local password",
    setup.includes(
      'randomBytes(32).toString("hex")'
    ),
  ],
  [
    "setup generates connector encryption key",
    setup.includes(
      "CONNECT_SECRET_ENCRYPTION_KEY"
    ) &&
      setup.includes(
        'randomBytes(32).toString("base64")'
      ),
  ],
  [
    "local env files are chmod 600",
    setup.includes("mode: 0o600"),
  ],
  [
    "migration runner tracks checksums",
    migrate.includes(
      "public.local_migrations"
    ) &&
      migrate.includes("sha256"),
  ],
  [
    "local auth compatibility is single-user",
    migrate.includes(
      "00000000-0000-0000-0000-000000000001"
    ) &&
      migrate.includes(
        "create or replace function auth.uid()"
      ),
  ],
  [
    "backup uses pg_dump",
    backup.includes("pg_dump") &&
      backup.includes("gzipSync"),
  ],
  [
    "restore uses psql",
    restore.includes("psql") &&
      restore.includes("gunzipSync"),
  ],
  [
    "browser cannot instantiate DB client",
    db.includes('import "server-only"'),
  ],
  [
    "cloud auth proxy is gone",
    !proxy.includes("auth.getClaims") &&
      !proxy.includes("Supabase"),
  ],
  [
    "application has no Supabase package imports",
    !appLibSource.includes(
      "@supabase/"
    ),
  ],
];

const failed = checks.filter(
  ([, ok]) => !ok
);
for (const [name, ok] of checks) {
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${name}`
  );
}
if (failed.length) {
  throw new Error(
    `Solpient Local test failure: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "Solpient Local V1 static security and architecture checks passed."
);
