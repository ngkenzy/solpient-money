import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // DATABASE_URL may already be supplied by the environment.
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Run npm run local:setup first."
  );
}

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
});

const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
const LOCAL_EMAIL =
  process.env.SOLPIENT_LOCAL_USER_EMAIL?.trim() ||
  "local@solpient.local";

await client.connect();

try {
  await client.query(`
    create extension if not exists pgcrypto;

    do $$
    begin
      if not exists (
        select 1 from pg_roles where rolname = 'anon'
      ) then
        create role anon nologin;
      end if;
      if not exists (
        select 1 from pg_roles where rolname = 'authenticated'
      ) then
        create role authenticated nologin;
      end if;
      if not exists (
        select 1 from pg_roles where rolname = 'service_role'
      ) then
        create role service_role nologin;
      end if;
    end
    $$;

    create schema if not exists auth;

    create table if not exists auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select '00000000-0000-0000-0000-000000000001'::uuid
    $$;

    create table if not exists public.local_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const migrationsDir = path.join(
    process.cwd(),
    "supabase",
    "migrations"
  );
  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const filename of filenames) {
    const sql = await readFile(
      path.join(migrationsDir, filename),
      "utf8"
    );
    const checksum = createHash("sha256")
      .update(sql)
      .digest("hex");

    const existing = await client.query(
      "select checksum from public.local_migrations where filename = $1",
      [filename]
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(
          `Local migration ${filename} changed after it was applied. Restore from backup or add a new migration instead of editing history.`
        );
      }
      continue;
    }

    process.stdout.write(
      `Applying ${filename} ... `
    );

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into public.local_migrations(filename, checksum) values ($1, $2)",
        [filename, checksum]
      );
      await client.query("commit");
      console.log("ok");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  await client.query(
    `
      insert into auth.users(id, email, updated_at)
      values ($1, $2, now())
      on conflict (id) do update
      set email = excluded.email,
          updated_at = now()
    `,
    [LOCAL_USER_ID, LOCAL_EMAIL]
  );

  console.log(
    "Solpient Local PostgreSQL schema is ready."
  );
} finally {
  await client.end();
}
