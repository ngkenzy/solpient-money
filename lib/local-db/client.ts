import "server-only";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/local-db/config";

type Row = Record<string, unknown>;
type DbError = { message: string };
type DbResponse<T = Row[]> = {
  data: T | null;
  error: DbError | null;
};

type Mutation =
  | { kind: "select" }
  | { kind: "insert"; rows: Row[] }
  | { kind: "update"; values: Row }
  | { kind: "delete" }
  | {
      kind: "upsert";
      rows: Row[];
      onConflict?: string;
    };

type Filter = {
  sql: string;
  values: unknown[];
};

const TABLES = new Set([
  "profiles",
  "households",
  "household_members",
  "accounts",
  "transactions",
  "holdings",
  "goals",
  "planning_assumptions",
  "net_worth_snapshots",
  "portfolio_snapshots",
  "user_preferences",
  "plaid_connections",
  "file_import_batches",
  "file_import_profiles",
  "direct_ofx_connections",
  "oauth_fdx_connections",
]);

const DEFAULT_CONFLICTS: Record<string, string[]> = {
  profiles: ["user_id"],
  user_preferences: ["user_id"],
  planning_assumptions: ["household_id"],
};

function identifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function tableName(value: string) {
  if (!TABLES.has(value)) {
    throw new Error(`Unknown Solpient table: ${value}`);
  }
  return `public.${identifier(value)}`;
}

function splitTopLevel(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

function relationSelect(
  baseTable: string,
  selection: string
) {
  const tokens = splitTopLevel(selection);
  const columns: string[] = [];
  const joins: string[] = [];
  const base = "base";

  for (const token of tokens) {
    if (token === "*") {
      columns.push(`${base}.*`);
      continue;
    }

    const relation = token.match(
      /^([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)\((.*)\)$/i
    );

    if (relation) {
      const [, alias, relationTable, inner] = relation;
      if (!TABLES.has(relationTable)) {
        throw new Error(
          `Unknown relation table: ${relationTable}`
        );
      }
      const relAlias = `rel_${alias}`;
      const fk = `${alias}_id`;
      const innerColumns = splitTopLevel(inner);
      const jsonPairs = innerColumns.flatMap((column) => {
        identifier(column);
        return [
          `'${column}'`,
          `${relAlias}.${identifier(column)}`,
        ];
      });

      joins.push(
        `LEFT JOIN public.${identifier(
          relationTable
        )} ${relAlias}
         ON ${relAlias}.id = ${base}.${identifier(fk)}`
      );
      columns.push(
        `CASE WHEN ${relAlias}.id IS NULL THEN NULL
         ELSE json_build_object(${jsonPairs.join(", ")})
         END AS ${identifier(alias)}`
      );
      continue;
    }

    identifier(token);
    columns.push(`${base}.${identifier(token)}`);
  }

  return {
    columns: columns.join(", "),
    joins: joins.join("\n"),
    from: `${tableName(baseTable)} ${base}`,
  };
}

function normalizeRows(
  input: Row | Row[]
): Row[] {
  return Array.isArray(input) ? input : [input];
}

function conflictColumns(
  table: string,
  explicit?: string
) {
  if (explicit) {
    return explicit
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return DEFAULT_CONFLICTS[table] ?? [];
}

declare global {
  var __solpientLocalPool: Pool | undefined;
}

function pool() {
  if (!global.__solpientLocalPool) {
    global.__solpientLocalPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return global.__solpientLocalPool;
}

export class LocalDbQueryBuilder
  implements PromiseLike<DbResponse<any>>
{
  private mutation: Mutation = { kind: "select" };
  private selection = "*";
  private filters: Filter[] = [];
  private orderings: string[] = [];
  private rowLimit: number | null = null;
  private singleMode: "none" | "single" | "maybe" = "none";

  constructor(private table: string) {
    tableName(table);
  }

  select(selection = "*") {
    this.selection = selection;
    return this;
  }

  insert(values: Row | Row[]) {
    this.mutation = {
      kind: "insert",
      rows: normalizeRows(values),
    };
    return this;
  }

  upsert(
    values: Row | Row[],
    options?: { onConflict?: string }
  ) {
    this.mutation = {
      kind: "upsert",
      rows: normalizeRows(values),
      onConflict: options?.onConflict,
    };
    return this;
  }

  update(values: Row) {
    this.mutation = {
      kind: "update",
      values,
    };
    return this;
  }

  delete() {
    this.mutation = { kind: "delete" };
    return this;
  }

  eq(column: string, value: unknown) {
    return this.addComparison(column, "=", value);
  }

  neq(column: string, value: unknown) {
    return this.addComparison(column, "<>", value);
  }

  gt(column: string, value: unknown) {
    return this.addComparison(column, ">", value);
  }

  gte(column: string, value: unknown) {
    return this.addComparison(column, ">=", value);
  }

  lt(column: string, value: unknown) {
    return this.addComparison(column, "<", value);
  }

  lte(column: string, value: unknown) {
    return this.addComparison(column, "<=", value);
  }

  is(column: string, value: unknown) {
    identifier(column);
    if (value === null) {
      this.filters.push({
        sql: `base.${identifier(column)} IS NULL`,
        values: [],
      });
    } else {
      this.filters.push({
        sql: `base.${identifier(column)} IS NOT DISTINCT FROM $VALUE`,
        values: [value],
      });
    }
    return this;
  }

  in(column: string, values: unknown[]) {
    identifier(column);
    if (!values.length) {
      this.filters.push({ sql: "FALSE", values: [] });
      return this;
    }
    this.filters.push({
      sql: `base.${identifier(column)} = ANY($VALUE)`,
      values: [values],
    });
    return this;
  }

  or(expression: string) {
    const branches = expression
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const sqlParts: string[] = [];
    const values: unknown[] = [];

    for (const branch of branches) {
      const parts = branch.split(".");
      const column = parts.shift() ?? "";
      identifier(column);

      if (
        parts[0] === "not" &&
        parts[1] === "is" &&
        parts[2] === "null"
      ) {
        sqlParts.push(
          `base.${identifier(column)} IS NOT NULL`
        );
        continue;
      }

      if (parts[0] === "is" && parts[1] === "null") {
        sqlParts.push(
          `base.${identifier(column)} IS NULL`
        );
        continue;
      }

      const operator = parts.shift();
      const rawValue = parts.join(".");
      const sqlOperator =
        operator === "eq"
          ? "="
          : operator === "neq"
            ? "<>"
            : null;

      if (!sqlOperator) {
        throw new Error(
          `Unsupported local OR filter: ${branch}`
        );
      }

      sqlParts.push(
        `base.${identifier(column)} ${sqlOperator} $VALUE`
      );
      values.push(rawValue);
    }

    this.filters.push({
      sql: `(${sqlParts.join(" OR ")})`,
      values,
    });
    return this;
  }

  order(
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
    }
  ) {
    identifier(column);
    const direction =
      options?.ascending === false ? "DESC" : "ASC";
    const nulls =
      options?.nullsFirst === true
        ? " NULLS FIRST"
        : options?.nullsFirst === false
          ? " NULLS LAST"
          : "";
    this.orderings.push(
      `base.${identifier(column)} ${direction}${nulls}`
    );
    return this;
  }

  limit(value: number) {
    this.rowLimit = Math.max(0, Math.floor(value));
    return this;
  }

  single() {
    this.singleMode = "single";
    this.rowLimit = 1;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    this.rowLimit = 1;
    return this;
  }

  private addComparison(
    column: string,
    operator: string,
    value: unknown
  ) {
    identifier(column);
    this.filters.push({
      sql: `base.${identifier(column)} ${operator} $VALUE`,
      values: [value],
    });
    return this;
  }

  private compileFilters(
    params: unknown[],
    alias = "base"
  ) {
    if (!this.filters.length) return "";

    const compiled = this.filters.map((filter) => {
      let sql = filter.sql.replaceAll("base.", `${alias}.`);
      for (const value of filter.values) {
        params.push(value);
        sql = sql.replace(
          "$VALUE",
          `$${params.length}`
        );
      }
      return sql;
    });

    return ` WHERE ${compiled.join(" AND ")}`;
  }

  private returningClause() {
    if (this.selection === "*" || this.selection.trim() === "") {
      return " RETURNING *";
    }
    const relation = relationSelect(
      this.table,
      this.selection
    );
    if (relation.joins) {
      throw new Error(
        "Nested relation selects are not supported in mutation RETURNING clauses."
      );
    }
    return ` RETURNING ${relation.columns.replaceAll("base.", "")}`;
  }

  private async execute(): Promise<DbResponse<any>> {
    try {
      const params: unknown[] = [];
      let sql = "";

      if (this.mutation.kind === "select") {
        const selected = relationSelect(
          this.table,
          this.selection
        );
        sql =
          `SELECT ${selected.columns} FROM ${selected.from}\n${selected.joins}`;
        sql += this.compileFilters(params, "base");
        if (this.orderings.length) {
          sql +=
            " ORDER BY " +
            this.orderings.join(", ");
        }
        if (this.rowLimit !== null) {
          params.push(this.rowLimit);
          sql += ` LIMIT $${params.length}`;
        }
      } else if (
        this.mutation.kind === "insert" ||
        this.mutation.kind === "upsert"
      ) {
        const rows = this.mutation.rows;
        if (!rows.length) {
          return { data: [], error: null };
        }
        const columns = Array.from(
          new Set(rows.flatMap((row) => Object.keys(row)))
        );
        columns.forEach(identifier);

        const valuesSql = rows.map((row) => {
          const placeholders = columns.map((column) => {
            params.push(
              Object.prototype.hasOwnProperty.call(row, column)
                ? row[column]
                : null
            );
            return `$${params.length}`;
          });
          return `(${placeholders.join(", ")})`;
        });

        sql =
          `INSERT INTO ${tableName(this.table)} (${columns
            .map(identifier)
            .join(", ")}) VALUES ${valuesSql.join(", ")}`;

        if (this.mutation.kind === "upsert") {
          const conflicts = conflictColumns(
            this.table,
            this.mutation.onConflict
          );
          if (!conflicts.length) {
            throw new Error(
              `No local upsert conflict target is configured for ${this.table}.`
            );
          }
          conflicts.forEach(identifier);
          const updates = columns
            .filter(
              (column) => !conflicts.includes(column)
            )
            .map(
              (column) =>
                `${identifier(column)} = EXCLUDED.${identifier(column)}`
            );
          sql +=
            ` ON CONFLICT (${conflicts
              .map(identifier)
              .join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
        }

        if (
          this.selection &&
          this.selection !== "__none__"
        ) {
          sql += this.returningClause();
        }
      } else if (this.mutation.kind === "update") {
        const entries = Object.entries(
          this.mutation.values
        );
        if (!entries.length) {
          return { data: [], error: null };
        }
        const sets = entries.map(([column, value]) => {
          identifier(column);
          params.push(value);
          return `${identifier(column)} = $${params.length}`;
        });
        sql =
          `UPDATE ${tableName(this.table)} base SET ${sets.join(", ")}`;
        sql += this.compileFilters(params, "base");
        if (
          this.selection &&
          this.selection !== "__none__"
        ) {
          sql += this.returningClause();
        }
      } else {
        sql = `DELETE FROM ${tableName(this.table)} base`;
        sql += this.compileFilters(params, "base");
        if (
          this.selection &&
          this.selection !== "__none__"
        ) {
          sql += this.returningClause();
        }
      }

      const result = await pool().query(sql, params);
      const rows = result.rows as Row[];

      if (this.singleMode === "single") {
        if (rows.length !== 1) {
          return {
            data: null,
            error: {
              message:
                rows.length === 0
                  ? "Expected one row, found none."
                  : "Expected one row, found multiple.",
            },
          };
        }
        return { data: rows[0], error: null };
      }

      if (this.singleMode === "maybe") {
        return {
          data: rows[0] ?? null,
          error: null,
        };
      }

      return {
        data: rows,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Local PostgreSQL query failed.",
        },
      };
    }
  }

  then<TResult1 = DbResponse<any>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: DbResponse<any>
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((
          reason: unknown
        ) => TResult2 | PromiseLike<TResult2>)
      | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(
      onfulfilled,
      onrejected
    );
  }
}

export class LocalDbClient {
  from(table: string) {
    return new LocalDbQueryBuilder(table);
  }

  async rpc(
    functionName: string,
    args: Record<string, unknown>
  ): Promise<DbResponse<any>> {
    try {
      identifier(functionName);
      const params: unknown[] = [];
      const named = Object.entries(args).map(
        ([name, value]) => {
          identifier(name);
          params.push(value);
          return `${identifier(name)} => $${params.length}`;
        }
      );
      const result = await pool().query(
        `SELECT * FROM public.${identifier(
          functionName
        )}(${named.join(", ")})`,
        params
      );
      return {
        data: result.rows,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Local PostgreSQL function call failed.",
        },
      };
    }
  }
}

export type SolpientDbClient = LocalDbClient;

export async function createLocalDbClient() {
  return new LocalDbClient();
}

export async function testLocalDatabase() {
  const result = await pool().query(
    "select current_database() as database, version() as version"
  );
  return result.rows[0] as {
    database: string;
    version: string;
  };
}
