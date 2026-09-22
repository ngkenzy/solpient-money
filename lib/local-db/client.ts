import "server-only";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/local-db/config";

export type LocalRow = Record<string, any>;

type DbError = { message: string };

export type DbResponse<T = LocalRow[]> = {
  data: T | null;
  error: DbError | null;
  count: number | null;
};

type Mutation =
  | { kind: "select" }
  | { kind: "insert"; rows: LocalRow[] }
  | { kind: "update"; values: LocalRow }
  | { kind: "delete" }
  | {
      kind: "upsert";
      rows: LocalRow[];
      onConflict?: string;
    };

type Filter = {
  sql: string;
  values: unknown[];
};

type SelectOptions = {
  count?: "exact";
  head?: boolean;
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
  input: LocalRow | LocalRow[]
): LocalRow[] {
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

export class LocalDbQueryBuilder<TData = LocalRow[]>
  implements PromiseLike<DbResponse<TData>>
{
  private mutation: Mutation = { kind: "select" };
  private selection = "*";
  private filters: Filter[] = [];
  private orderings: string[] = [];
  private rowLimit: number | null = null;
  private singleMode: "none" | "single" | "maybe" =
    "none";
  private countRequested = false;
  private head = false;

  constructor(private table: string) {
    tableName(table);
  }

  select(
    selection = "*",
    options?: SelectOptions
  ) {
    this.selection = selection;
    this.countRequested =
      options?.count === "exact";
    this.head = options?.head === true;
    return this;
  }

  insert(values: LocalRow | LocalRow[]) {
    this.mutation = {
      kind: "insert",
      rows: normalizeRows(values),
    };
    return this;
  }

  upsert(
    values: LocalRow | LocalRow[],
    options?: { onConflict?: string }
  ) {
    this.mutation = {
      kind: "upsert",
      rows: normalizeRows(values),
      onConflict: options?.onConflict,
    };
    return this;
  }

  update(values: LocalRow) {
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
        sql:
          `base.${identifier(column)} IS NOT DISTINCT FROM $VALUE`,
        values: [value],
      });
    }

    return this;
  }

  in(column: string, values: unknown[]) {
    identifier(column);

    if (!values.length) {
      this.filters.push({
        sql: "FALSE",
        values: [],
      });
      return this;
    }

    this.filters.push({
      sql:
        `base.${identifier(column)} = ANY($VALUE)`,
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

      if (
        parts[0] === "is" &&
        parts[1] === "null"
      ) {
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
      options?.ascending === false
        ? "DESC"
        : "ASC";

    const nulls =
      options?.nullsFirst === true
        ? " NULLS FIRST"
        : options?.nullsFirst === false
          ? " NULLS LAST"
          : "";

    this.orderings.push(
      `base.${identifier(
        column
      )} ${direction}${nulls}`
    );

    return this;
  }

  limit(value: number) {
    this.rowLimit = Math.max(
      0,
      Math.floor(value)
    );
    return this;
  }

  single(): LocalDbQueryBuilder<LocalRow> {
    this.singleMode = "single";
    this.rowLimit = 1;
    return this as unknown as LocalDbQueryBuilder<LocalRow>;
  }

  maybeSingle(): LocalDbQueryBuilder<LocalRow | null> {
    this.singleMode = "maybe";
    this.rowLimit = 1;
    return this as unknown as LocalDbQueryBuilder<
      LocalRow | null
    >;
  }

  private addComparison(
    column: string,
    operator: string,
    value: unknown
  ) {
    identifier(column);

    this.filters.push({
      sql:
        `base.${identifier(column)} ${operator} $VALUE`,
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
      let sql = filter.sql.replaceAll(
        "base.",
        `${alias}.`
      );

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
    if (
      this.selection === "*" ||
      this.selection.trim() === ""
    ) {
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

    return ` RETURNING ${relation.columns.replaceAll(
      "base.",
      ""
    )}`;
  }

  private async executeRaw(): Promise<
    DbResponse<LocalRow[] | LocalRow | null>
  > {
    try {
      const params: unknown[] = [];
      let sql = "";
      let count: number | null = null;

      if (this.mutation.kind === "select") {
        if (this.head && this.countRequested) {
          sql =
            `SELECT COUNT(*)::int AS "__count" FROM ${tableName(
              this.table
            )} base`;
          sql += this.compileFilters(
            params,
            "base"
          );

          const result = await pool().query(
            sql,
            params
          );
          count = Number(
            result.rows[0]?.__count ?? 0
          );

          return {
            data: null,
            error: null,
            count,
          };
        }

        const selected = relationSelect(
          this.table,
          this.selection
        );

        sql =
          `SELECT ${selected.columns} FROM ${selected.from}\n${selected.joins}`;

        sql += this.compileFilters(
          params,
          "base"
        );

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
          return {
            data: [],
            error: null,
            count: null,
          };
        }

        const columns = Array.from(
          new Set(
            rows.flatMap((row) =>
              Object.keys(row)
            )
          )
        );

        columns.forEach(identifier);

        const valuesSql = rows.map((row) => {
          const placeholders = columns.map(
            (column) => {
              params.push(
                Object.prototype.hasOwnProperty.call(
                  row,
                  column
                )
                  ? row[column]
                  : null
              );
              return `$${params.length}`;
            }
          );

          return `(${placeholders.join(", ")})`;
        });

        sql =
          `INSERT INTO ${tableName(
            this.table
          )} (${columns
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
              (column) =>
                !conflicts.includes(column)
            )
            .map(
              (column) =>
                `${identifier(
                  column
                )} = EXCLUDED.${identifier(column)}`
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
      } else if (
        this.mutation.kind === "update"
      ) {
        const entries = Object.entries(
          this.mutation.values
        );

        if (!entries.length) {
          return {
            data: [],
            error: null,
            count: null,
          };
        }

        const sets = entries.map(
          ([column, value]) => {
            identifier(column);
            params.push(value);
            return `${identifier(
              column
            )} = $${params.length}`;
          }
        );

        sql =
          `UPDATE ${tableName(
            this.table
          )} base SET ${sets.join(", ")}`;

        sql += this.compileFilters(
          params,
          "base"
        );

        if (
          this.selection &&
          this.selection !== "__none__"
        ) {
          sql += this.returningClause();
        }
      } else {
        sql =
          `DELETE FROM ${tableName(
            this.table
          )} base`;

        sql += this.compileFilters(
          params,
          "base"
        );

        if (
          this.selection &&
          this.selection !== "__none__"
        ) {
          sql += this.returningClause();
        }
      }

      const result = await pool().query(
        sql,
        params
      );

      const rows =
        result.rows as LocalRow[];

      if (this.countRequested) {
        count = result.rowCount;
      }

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
            count,
          };
        }

        return {
          data: rows[0],
          error: null,
          count,
        };
      }

      if (this.singleMode === "maybe") {
        return {
          data: rows[0] ?? null,
          error: null,
          count,
        };
      }

      return {
        data: rows,
        error: null,
        count,
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
        count: null,
      };
    }
  }

  then<
    TResult1 = DbResponse<TData>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: DbResponse<TData>
        ) =>
          | TResult1
          | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((
          reason: unknown
        ) =>
          | TResult2
          | PromiseLike<TResult2>)
      | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.executeRaw()
      .then(
        (value) =>
          value as DbResponse<TData>
      )
      .then(
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
  ): Promise<DbResponse<LocalRow[]>> {
    try {
      identifier(functionName);

      const params: unknown[] = [];

      const named = Object.entries(args).map(
        ([name, value]) => {
          identifier(name);
          params.push(value);
          return `${identifier(
            name
          )} => $${params.length}`;
        }
      );

      const result = await pool().query(
        `SELECT * FROM public.${identifier(
          functionName
        )}(${named.join(", ")})`,
        params
      );

      return {
        data: result.rows as LocalRow[],
        error: null,
        count: result.rowCount,
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
        count: null,
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
