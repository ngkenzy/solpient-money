import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  ShieldAlert,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  getTspStatementImport,
  reconcileTspStatementReview,
} from "@/lib/tsp-statement-imports";
import {
  confirmTspStatementImport,
  rejectTspStatementImport,
  saveTspStatementImportReview,
} from "../actions";

export const dynamic = "force-dynamic";

function dollars(cents: number | null) {
  return cents == null
    ? ""
    : (cents / 100).toFixed(2);
}

function signedMoney(cents: number | null) {
  if (cents == null) return "—";
  const sign = cents > 0 ? "+" : "";
  return `${sign}${(cents / 100).toFixed(2)}`;
}

function issueText(
  issues: Array<{ code: string; message: string }>
) {
  return issues
    .map((issue) => issue.message || issue.code)
    .join(" · ");
}

const CORE_REVIEW_FUNDS = [
  ["G", "Government Securities Investment Fund"],
  ["F", "Fixed Income Index Investment Fund"],
  ["C", "Common Stock Index Investment Fund"],
  ["S", "Small Capitalization Stock Index Investment Fund"],
  ["I", "International Stock Index Investment Fund"],
] as const;

export default async function TspStatementReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record =
    await getTspStatementImport(id);

  if (!record) notFound();

  const reconciliation =
    reconcileTspStatementReview(
      record.review
    );

  const byCode = new Map(
    record.review.funds.map((fund) => [
      fund.fundCode.toUpperCase(),
      fund,
    ])
  );

  const coreReviewFunds =
    CORE_REVIEW_FUNDS.map(
      ([fundCode, fundName]) =>
        byCode.get(fundCode) ?? {
          fundCode,
          fundName,
          balanceCents: null,
        }
    );

  const extraReviewFunds =
    record.review.funds.filter(
      (fund) =>
        !CORE_REVIEW_FUNDS.some(
          ([code]) =>
            code ===
            fund.fundCode.toUpperCase()
        )
    );

  const editableFunds = [
    ...coreReviewFunds,
    ...extraReviewFunds,
    {
      fundCode: "",
      fundName: "",
      balanceCents: null,
    },
  ];

  const confirmed =
    record.validationState === "confirmed";

  return (
    <div className="page tsp-page">
      <PageHeader
        eyebrow="V1.8 · REVIEW TSP STATEMENT"
        title={
          record.sourceFilename ??
          "TSP statement candidate"
        }
        description="These are parser-extracted candidate values. Review them before confirmation. Confirmation creates a new immutable TSP snapshot revision."
        action={
          <Link
            className="research-button"
            href="/tsp/import"
          >
            <ArrowLeft size={14} />
            Import queue
          </Link>
        }
      />

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              PROVENANCE
            </span>
            <h2>
              What produced this candidate
            </h2>
          </div>
          <FileCheck2 size={18} />
        </div>

        <div className="tsp-import-provenance">
          <div>
            <span>Parser</span>
            <strong>{record.parserVersion}</strong>
          </div>
          <div>
            <span>Source type</span>
            <strong>{record.sourceKind}</strong>
          </div>
          <div>
            <span>SHA-256</span>
            <strong>
              {record.sourceContentSha256.slice(
                0,
                16
              )}
              …
            </strong>
          </div>
          <div>
            <span>Status</span>
            <strong>
              {record.validationState.replaceAll(
                "_",
                " "
              )}
            </strong>
          </div>
        </div>

        {record.parserWarnings.length ? (
          <div className="tsp-import-message watch">
            <AlertTriangle size={16} />
            <div>
              <strong>Parser warnings</strong>
              <span>
                {issueText(
                  record.parserWarnings
                )}
              </span>
            </div>
          </div>
        ) : null}

        {record.parserErrors.length ? (
          <div className="tsp-import-message critical">
            <ShieldAlert size={16} />
            <div>
              <strong>Parser errors retained for provenance</strong>
              <span>
                {issueText(
                  record.parserErrors
                )}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <form
        action={
          saveTspStatementImportReview
        }
      >
        <input
          type="hidden"
          name="importId"
          value={record.id}
        />

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                REVIEWED VALUES
              </span>
              <h2>
                Verify statement balances and contributions
              </h2>
            </div>
          </div>

          <div className="tsp-form tsp-import-review-grid">
            <label>
              <span>Statement date</span>
              <input
                type="date"
                name="statementDate"
                defaultValue={
                  record.review.statementDate ??
                  ""
                }
                disabled={confirmed}
              />
            </label>

            <label>
              <span>Traditional balance</span>
              <input
                name="traditionalBalance"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .traditionalBalanceCents
                )}
                disabled={confirmed}
              />
            </label>

            <label>
              <span>Roth balance</span>
              <input
                name="rothBalance"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .rothBalanceCents
                )}
                disabled={confirmed}
              />
            </label>

            <label>
              <span>Reported total</span>
              <input
                name="reportedTotalBalance"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .reportedTotalBalanceCents
                )}
                disabled={confirmed}
              />
            </label>

            <label>
              <span>TSP loan balance</span>
              <input
                name="outstandingLoan"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .outstandingLoanCents
                )}
                disabled={confirmed}
              />
            </label>

            <label>
              <span>Employee contributions YTD</span>
              <input
                name="employeeContribYtd"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .employeeContribYtdCents
                )}
                disabled={confirmed}
              />
            </label>

            <label>
              <span>Service automatic YTD</span>
              <input
                name="serviceAutoYtd"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .serviceAutoYtdCents
                )}
                disabled={confirmed}
              />
            </label>

            <label>
              <span>Service match YTD</span>
              <input
                name="serviceMatchYtd"
                inputMode="decimal"
                defaultValue={dollars(
                  record.review
                    .serviceMatchYtdCents
                )}
                disabled={confirmed}
              />
            </label>
          </div>
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                FUND REVIEW
              </span>
              <h2>
                Verify the fund-level balances
              </h2>
            </div>
          </div>

          <div className="tsp-import-funds">
            {editableFunds.map(
              (fund, index) => (
                <div
                  className="tsp-import-fund-row"
                  key={`${fund.fundCode || "custom"}-${index}`}
                >
                  <input
                    name="fundCode"
                    defaultValue={
                      fund.fundCode
                    }
                    placeholder="Fund code"
                    aria-label="Fund code"
                    disabled={confirmed}
                  />
                  <input
                    name="fundName"
                    defaultValue={
                      fund.fundName
                    }
                    placeholder="Fund name"
                    aria-label="Fund name"
                    disabled={confirmed}
                  />
                  <input
                    name="fundBalance"
                    inputMode="decimal"
                    defaultValue={dollars(
                      fund.balanceCents
                    )}
                    placeholder="0.00"
                    aria-label="Fund balance"
                    disabled={confirmed}
                  />
                </div>
              )
            )}
          </div>

          <div className="tsp-import-reconciliation">
            <div>
              <span>Traditional + Roth</span>
              <strong>
                {reconciliation.accountBalanceCents ==
                null
                  ? "—"
                  : `$${(
                      reconciliation.accountBalanceCents /
                      100
                    ).toFixed(2)}`}
              </strong>
            </div>
            <div>
              <span>Balance delta</span>
              <strong>
                {signedMoney(
                  reconciliation.balanceDeltaCents
                )}
              </strong>
            </div>
            <div>
              <span>Fund delta</span>
              <strong>
                {signedMoney(
                  reconciliation.fundDeltaCents
                )}
              </strong>
            </div>
            <div>
              <span>Confirm readiness</span>
              <strong>
                {reconciliation.ready
                  ? "Ready"
                  : "Needs review"}
              </strong>
            </div>
          </div>

          <label className="tsp-import-note">
            <span>Review note</span>
            <textarea
              name="reviewNote"
              defaultValue={
                record.reviewNote ?? ""
              }
              disabled={confirmed}
            />
          </label>

          {!confirmed ? (
            <div className="connect-actions">
              <button
                className="research-button"
                type="submit"
              >
                Save review
              </button>
            </div>
          ) : null}
        </section>
      </form>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              CONFIRMATION
            </span>
            <h2>
              Commit reviewed values to TSP history
            </h2>
          </div>
          <CheckCircle2 size={18} />
        </div>

        {confirmed ? (
          <div className="tsp-import-message positive">
            <CheckCircle2 size={16} />
            <div>
              <strong>
                Confirmed as immutable TSP history
              </strong>
              <span>
                Snapshot revision{" "}
                {record.confirmedSnapshotRevision ??
                  "—"}{" "}
                was created. The parsed import remains linked as provenance.
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="bottom-note">
              <ShieldAlert size={15} />
              <span>
                Confirmation is allowed only after the saved review reaches READY. It inserts a new snapshot revision; it never overwrites an existing snapshot.
              </span>
            </div>

            <div className="tsp-import-confirm-actions">
              <form
                action={
                  rejectTspStatementImport
                }
              >
                <input
                  type="hidden"
                  name="importId"
                  value={record.id}
                />
                <button
                  className="research-button secondary"
                  type="submit"
                >
                  Reject import
                </button>
              </form>

              <form
                action={
                  confirmTspStatementImport
                }
              >
                <input
                  type="hidden"
                  name="importId"
                  value={record.id}
                />
                <button
                  className="research-button"
                  type="submit"
                  disabled={
                    record.validationState !==
                    "ready"
                  }
                >
                  Confirm statement
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
