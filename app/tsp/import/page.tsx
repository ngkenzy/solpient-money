import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  ShieldCheck,
  Upload,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getTspStatementImports } from "@/lib/tsp-statement-imports";

export const dynamic = "force-dynamic";

function stateLabel(state: string) {
  if (state === "confirmed") return "Confirmed";
  if (state === "ready") return "Ready to confirm";
  if (state === "invalid") return "Parser issues";
  if (state === "rejected") return "Rejected";
  return "Review required";
}

export default async function TspStatementImportsPage() {
  const imports =
    await getTspStatementImports();

  return (
    <div className="page tsp-page">
      <PageHeader
        eyebrow="V1.8 · TSP STATEMENT IMPORT"
        title="Review first. Confirm second."
        description="Solpient keeps parser output separate from confirmed TSP history. A parsed statement never becomes an official snapshot until you review and confirm it."
        action={
          <Link
            className="research-button"
            href="/tsp"
          >
            <ArrowLeft size={14} />
            Back to TSP
          </Link>
        }
      />

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              IMPORT PIPELINE
            </span>
            <h2>
              Local, deterministic statement processing
            </h2>
          </div>
          <ShieldCheck size={18} />
        </div>

        <div className="tsp-import-principles">
          <div>
            <Upload size={17} />
            <div>
              <strong>Parse locally</strong>
              <span>
                Raw statement content is not stored in the database.
              </span>
            </div>
          </div>
          <div>
            <FileSearch size={17} />
            <div>
              <strong>Review extracted values</strong>
              <span>
                Parser output is only a candidate until you verify it.
              </span>
            </div>
          </div>
          <div>
            <CheckCircle2 size={17} />
            <div>
              <strong>Confirm immutable history</strong>
              <span>
                Confirmation inserts a new TSP snapshot revision; it never upserts an old one.
              </span>
            </div>
          </div>
        </div>

        <div className="bottom-note">
          <Upload size={15} />
          <span>
            Statement upload/parser integration is intentionally separate from this workflow and will be connected after the deterministic parser is reviewed.
          </span>
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              IMPORT HISTORY
            </span>
            <h2>
              Staged statement candidates
            </h2>
          </div>
        </div>

        {imports.length ? (
          <div className="tsp-import-list">
            {imports.map((item) => (
              <Link
                key={item.id}
                href={`/tsp/import/${item.id}`}
                className="tsp-import-row"
              >
                <div>
                  <strong>
                    {item.sourceFilename ??
                      "TSP statement"}
                  </strong>
                  <span>
                    {item.review.statementDate ??
                      item.parsedStatementDate ??
                      "Date unresolved"}
                    {" · "}
                    parser {item.parserVersion}
                  </span>
                </div>

                <div>
                  <span>Status</span>
                  <strong>
                    {stateLabel(
                      item.validationState
                    )}
                  </strong>
                </div>

                <div>
                  <span>Warnings</span>
                  <strong>
                    {item.parserWarnings.length}
                  </strong>
                </div>

                <div>
                  <span>Errors</span>
                  <strong>
                    {item.parserErrors.length}
                  </strong>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="action-empty">
            <FileSearch size={24} />
            <strong>
              No statement imports yet.
            </strong>
            <span>
              Parsed TSP statements will appear here for review before they can affect your TSP history.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
