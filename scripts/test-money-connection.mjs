import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile("package.json", "utf8")
);
const compose = await readFile(
  "docker-compose.local.yml",
  "utf8"
);
const client = await readFile(
  "lib/local-db/client.ts",
  "utf8"
);
const auth = await readFile(
  "lib/money-auth.ts",
  "utf8"
);

if (packageJson.dependencies?.["@supabase/ssr"]) {
  throw new Error(
    "Supabase SSR remains in Money runtime dependencies."
  );
}
if (packageJson.dependencies?.["@supabase/supabase-js"]) {
  throw new Error(
    "Supabase JS remains in Money runtime dependencies."
  );
}
if (packageJson.dependencies?.pg !== "8.23.0") {
  throw new Error("Local PostgreSQL driver is not pinned.");
}
if (!compose.includes('"127.0.0.1:5432:5432"')) {
  throw new Error(
    "Local PostgreSQL is not bound to loopback only."
  );
}
if (!client.includes("LocalDbClient")) {
  throw new Error(
    "Local PostgreSQL client is missing."
  );
}
if (!auth.includes("LOCAL_USER_ID")) {
  throw new Error(
    "Single-user local identity is missing."
  );
}

console.log(
  "Solpient Money local PostgreSQL runtime checks passed."
);
