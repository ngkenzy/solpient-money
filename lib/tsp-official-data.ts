import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";
import {
  TSP_OFFICIAL_CSV_VERSION,
  type TspOfficialCsvResult,
} from "@/lib/tsp-official-csv";

export type LatestTspOfficialImport = {
  id: string;
  sourceFilename: string | null;
  importedAt: string | null;
  statement: TspOfficialCsvResult;
};

function isOfficialCandidate(
  value: unknown
): value is TspOfficialCsvResult {
  if (!value || typeof value !== "object") return false;

  const candidate =
    value as Partial<TspOfficialCsvResult>;

  return (
    candidate.parserVersion ===
      TSP_OFFICIAL_CSV_VERSION &&
    typeof candidate.plan === "string" &&
    typeof candidate.periodStart === "string" &&
    typeof candidate.periodEnd === "string" &&
    Array.isArray(candidate.funds) &&
    Boolean(candidate.totals)
  );
}

export async function getLatestTspOfficialImport(): Promise<
  LatestTspOfficialImport | null
> {
  const { database, householdId } =
    await requireActiveHousehold();

  const { data, error } = await database
    .from("tsp_statement_imports")
    .select(
      "id,source_filename,imported_at,parsed_candidate"
    )
    .eq("household_id", householdId)
    .eq(
      "parser_version",
      TSP_OFFICIAL_CSV_VERSION
    )
    .order("parsed_statement_date", {
      ascending: false,
      nullsFirst: false,
    })
    .order("imported_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load latest official TSP import: ${error.message}`
    );
  }

  if (!data) return null;

  const parsed = data.parsed_candidate;

  if (!isOfficialCandidate(parsed)) {
    throw new Error(
      "The latest TSP import has an unsupported stored format."
    );
  }

  return {
    id: String(data.id),
    sourceFilename:
      data.source_filename == null
        ? null
        : String(data.source_filename),
    importedAt:
      data.imported_at == null
        ? null
        : String(data.imported_at),
    statement: parsed,
  };
}
