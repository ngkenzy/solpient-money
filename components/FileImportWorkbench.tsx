"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  inspectFinancialFile,
  parseFinancialFile,
  type CsvColumnMapping,
  type FileInspection,
  type ImportKind,
  type ParsedFinancialFile,
} from "@/lib/connect/file-parser";
import type {
  ConnectAnalysis,
  ConnectAnomaly,
} from "@/lib/connect/reconciliation";

type ImportAccount = {
  id: string;
  name: string;
  institution: string;
  type: string;
  source: string;
};

type ImportProfile = {
  profile_name?: string | null;
  institution?: string | null;
  preferred_account_id?: string | null;
  account_name?: string | null;
  account_type?: "cash" | "investment" | "retirement" | "debt" | null;
  last_four?: string | null;
  column_mapping?: CsvColumnMapping | null;
};

type PreviewResult = {
  total: number;
  withinFileDuplicates: number;
  existingDuplicates: number;
  estimatedUpdates: number;
  estimatedNew: number;
  priorFileImport: {
    id: string;
    created_at: string;
    imported_records: number;
    duplicate_records: number;
    status: string;
  } | null;
  analysis: ConnectAnalysis;
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
  required,
}: {
  label: string;
  value?: string;
  headers: string[];
  onChange: (value: string | undefined) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value || undefined)
        }
      >
        <option value="">Not mapped</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

function anomalyTone(anomaly: ConnectAnomaly) {
  return anomaly.severity === "warning" ? "warning" : "info";
}

export default function FileImportWorkbench({
  accounts,
}: {
  accounts: ImportAccount[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileDigest, setFileDigest] = useState("");
  const [rawText, setRawText] = useState("");
  const [inspection, setInspection] = useState<FileInspection | null>(null);
  const [parsed, setParsed] = useState<ParsedFinancialFile | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>({
    kind: "transactions",
  });
  const [showMapping, setShowMapping] = useState(false);
  const [recognizedProfile, setRecognizedProfile] = useState<string | null>(null);
  const [rememberFormat, setRememberFormat] = useState(true);
  const [targetAccountId, setTargetAccountId] = useState("__new__");
  const [accountName, setAccountName] = useState("");
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState<
    "cash" | "investment" | "retirement" | "debt"
  >("cash");
  const [lastFour, setLastFour] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState<
    "parse" | "preview" | "import" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    importedRecords: number;
    duplicateRecords: number;
    remembered: boolean;
    analysis?: ConnectAnalysis;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  function applyParsedDefaults(
    next: ParsedFinancialFile,
    profile?: ImportProfile | null
  ) {
    setParsed(next);
    setMapping(next.columnMapping);
    setAccountName(profile?.account_name || next.accountName);
    setInstitution(
      profile?.institution || next.institutionGuess || "File import"
    );
    setAccountType(profile?.account_type || next.accountType);
    setLastFour(profile?.last_four || next.accountMask);

    const preferred = profile?.preferred_account_id
      ? accounts.find(
          (account) => account.id === profile.preferred_account_id
        )
      : null;
    setTargetAccountId(preferred ? preferred.id : "__new__");
  }

  async function loadFile(file: File) {
    setBusy("parse");
    setError(null);
    setPreview(null);
    setResult(null);
    setRecognizedProfile(null);
    setShowMapping(false);

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Connect V1.1 accepts files up to 10 MB.");
      }
      const extension = file.name.toLowerCase().split(".").pop();
      if (!["csv", "qfx", "ofx"].includes(extension ?? "")) {
        throw new Error("Use a CSV, QFX, or OFX file.");
      }

      const text = await file.text();
      const nextInspection = inspectFinancialFile(file.name, text);
      const hash = await sha256(text);

      setFileName(file.name);
      setFileDigest(hash);
      setRawText(text);
      setInspection(nextInspection);

      let profile: ImportProfile | null = null;
      try {
        const response = await fetch(
          `/api/connect/profile?signature=${encodeURIComponent(
            nextInspection.formatSignature
          )}`
        );
        const body = await response.json();
        if (response.ok && body.profile) {
          profile = body.profile as ImportProfile;
          setRecognizedProfile(
            profile.profile_name || "Remembered format"
          );
        }
      } catch {
        // Profile lookup is an enhancement; parsing still works without it.
      }

      const rememberedMapping =
        profile?.column_mapping &&
        Object.keys(profile.column_mapping).length > 0
          ? profile.column_mapping
          : undefined;

      try {
        const next = parseFinancialFile(
          file.name,
          text,
          rememberedMapping
        );
        applyParsedDefaults(next, profile);
      } catch (parseError) {
        setParsed(null);
        if (nextInspection.format === "csv") {
          setMapping(
            rememberedMapping ?? { kind: "transactions" }
          );
          setShowMapping(true);
          setError(
            `${
              parseError instanceof Error
                ? parseError.message
                : "Automatic mapping failed."
            } Select the correct columns below.`
          );
        } else {
          throw parseError;
        }
      }
    } catch (loadError) {
      setParsed(null);
      setInspection(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to read this file."
      );
    } finally {
      setBusy(null);
    }
  }

  function applyMapping() {
    if (!inspection || inspection.format !== "csv" || !rawText) {
      return;
    }

    try {
      const next = parseFinancialFile(fileName, rawText, mapping);
      applyParsedDefaults(next, null);
      setShowMapping(false);
      setPreview(null);
      setResult(null);
      setError(null);
    } catch (mappingError) {
      setError(
        mappingError instanceof Error
          ? mappingError.message
          : "This mapping could not be parsed."
      );
    }
  }

  async function callImport(action: "preview" | "import") {
    if (!parsed) return;
    setBusy(action);
    setError(null);
    if (action === "import") setResult(null);

    try {
      const response = await fetch("/api/connect/file-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fileName,
          fileDigest,
          parsed,
          rememberFormat,
          targetAccountId:
            targetAccountId === "__new__"
              ? null
              : targetAccountId,
          newAccount:
            targetAccountId === "__new__"
              ? {
                  name: accountName,
                  institution,
                  accountType,
                  lastFour,
                }
              : undefined,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Import request failed.");
      }

      if (action === "preview") {
        setPreview(body.preview);
      } else {
        setResult({
          importedRecords: body.importedRecords ?? 0,
          duplicateRecords: body.duplicateRecords ?? 0,
          remembered: Boolean(body.remembered),
          analysis: body.analysis,
        });
        setPreview(null);
        router.refresh();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Import request failed."
      );
    } finally {
      setBusy(null);
    }
  }

  function clear() {
    setFileName("");
    setFileDigest("");
    setRawText("");
    setInspection(null);
    setParsed(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setRecognizedProfile(null);
    setShowMapping(false);
    setMapping({ kind: "transactions" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const recordCount = parsed
    ? parsed.kind === "transactions"
      ? parsed.transactions.length
      : parsed.holdings.length
    : 0;
  const activeAnalysis = preview?.analysis ?? result?.analysis;

  return (
    <div className="connect-workbench">
      <section id="file-import" className="card page-card connect-upload-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              NATIVE FILE CONNECTOR
            </span>
            <h2>Import, reconcile, remember.</h2>
          </div>
          <span className="connect-free-pill">
            NO AGGREGATOR FEE
          </span>
        </div>

        {!inspection ? (
          <div
            className={
              "connect-dropzone" + (dragging ? " dragging" : "")
            }
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void loadFile(file);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                inputRef.current?.click();
              }
            }}
          >
            <FileUp size={28} />
            <strong>
              {busy === "parse"
                ? "Reading statement..."
                : "Drop a financial file here"}
            </strong>
            <span>CSV · QFX · OFX · up to 10 MB</span>
            <button type="button">Choose file</button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.qfx,.ofx,text/csv,application/x-ofx"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
          </div>
        ) : (
          <>
            <div className="connect-file-summary">
              <span className="connect-file-icon">
                <FileSpreadsheet size={22} />
              </span>
              <div>
                <strong>{fileName}</strong>
                <span>
                  {inspection.format.toUpperCase()}
                  {parsed
                    ? ` · ${parsed.kind} · ${recordCount} detected records`
                    : " · mapping needed"}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={clear}
                aria-label="Remove file"
              >
                <X size={16} />
              </button>
            </div>

            {recognizedProfile ? (
              <div className="connect-recognized">
                <Sparkles size={16} />
                <div>
                  <strong>Format recognized</strong>
                  <span>
                    {recognizedProfile} settings were applied automatically.
                  </span>
                </div>
              </div>
            ) : null}

            {inspection.format === "csv" ? (
              <div className="connect-mapping-toggle">
                <button
                  type="button"
                  onClick={() => setShowMapping((value) => !value)}
                >
                  <SlidersHorizontal size={14} />
                  {showMapping ? "Hide mapping" : "Fix mapping"}
                </button>
                <span>
                  {inspection.headers.length} columns detected
                </span>
              </div>
            ) : null}

            {showMapping &&
            inspection.format === "csv" ? (
              <div className="connect-mapping-editor">
                <div className="section-title-row">
                  <div>
                    <span className="card-kicker">
                      COLUMN MAPPING
                    </span>
                    <h2>Teach Solpient this format once.</h2>
                  </div>
                  <select
                    value={mapping.kind ?? "transactions"}
                    onChange={(event) =>
                      setMapping({
                        kind: event.target.value as ImportKind,
                      })
                    }
                  >
                    <option value="transactions">
                      Transactions
                    </option>
                    <option value="holdings">Holdings</option>
                  </select>
                </div>

                <div className="connect-mapping-grid">
                  {(mapping.kind ?? "transactions") ===
                  "transactions" ? (
                    <>
                      <ColumnSelect
                        label="Date"
                        required
                        headers={inspection.headers}
                        value={mapping.date}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            date: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Description"
                        required
                        headers={inspection.headers}
                        value={mapping.merchant}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            merchant: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Amount"
                        headers={inspection.headers}
                        value={mapping.amount}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            amount: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Debit"
                        headers={inspection.headers}
                        value={mapping.debit}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            debit: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Credit"
                        headers={inspection.headers}
                        value={mapping.credit}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            credit: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Category"
                        headers={inspection.headers}
                        value={mapping.category}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            category: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Running balance"
                        headers={inspection.headers}
                        value={mapping.balance}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            balance: value,
                          }))
                        }
                      />
                    </>
                  ) : (
                    <>
                      <ColumnSelect
                        label="Ticker / symbol"
                        required
                        headers={inspection.headers}
                        value={mapping.ticker}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            ticker: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Security name"
                        headers={inspection.headers}
                        value={mapping.holdingName}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            holdingName: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Shares / quantity"
                        required
                        headers={inspection.headers}
                        value={mapping.shares}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            shares: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Price"
                        headers={inspection.headers}
                        value={mapping.price}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            price: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Market value"
                        headers={inspection.headers}
                        value={mapping.marketValue}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            marketValue: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Cost basis"
                        headers={inspection.headers}
                        value={mapping.costBasis}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            costBasis: value,
                          }))
                        }
                      />
                      <ColumnSelect
                        label="Security type"
                        headers={inspection.headers}
                        value={mapping.securityType}
                        onChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            securityType: value,
                          }))
                        }
                      />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="data-submit"
                  onClick={applyMapping}
                >
                  Apply mapping
                </button>
              </div>
            ) : null}

            {parsed ? (
              <>
                <div className="connect-detection-grid">
                  <div>
                    <span>Format</span>
                    <strong>{parsed.format.toUpperCase()}</strong>
                  </div>
                  <div>
                    <span>Detected</span>
                    <strong>
                      {parsed.kind === "transactions"
                        ? "Transactions"
                        : "Holdings"}
                    </strong>
                  </div>
                  <div>
                    <span>Institution</span>
                    <strong>
                      {parsed.institutionGuess || "Not embedded"}
                    </strong>
                  </div>
                  <div>
                    <span>Statement value</span>
                    <strong>
                      {money(parsed.closingBalance)}
                    </strong>
                  </div>
                </div>

                <div className="connect-account-target">
                  <label>
                    <span>Import into</span>
                    <select
                      value={targetAccountId}
                      onChange={(event) => {
                        setTargetAccountId(event.target.value);
                        setPreview(null);
                      }}
                    >
                      <option value="__new__">
                        Create a new account
                      </option>
                      {accounts.map((account) => (
                        <option
                          key={account.id}
                          value={account.id}
                        >
                          {account.name} · {account.institution}
                        </option>
                      ))}
                    </select>
                  </label>

                  {targetAccountId === "__new__" ? (
                    <div className="connect-new-account-grid">
                      <label>
                        <span>Account name</span>
                        <input
                          value={accountName}
                          onChange={(event) =>
                            setAccountName(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Institution</span>
                        <input
                          value={institution}
                          onChange={(event) =>
                            setInstitution(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Account type</span>
                        <select
                          value={accountType}
                          onChange={(event) =>
                            setAccountType(
                              event.target.value as typeof accountType
                            )
                          }
                        >
                          <option value="cash">Cash / bank</option>
                          <option value="investment">
                            Investment
                          </option>
                          <option value="retirement">
                            Retirement
                          </option>
                          <option value="debt">
                            Debt / credit
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>Last four</span>
                        <input
                          maxLength={8}
                          value={lastFour}
                          onChange={(event) =>
                            setLastFour(event.target.value)
                          }
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <label className="connect-remember">
                  <input
                    type="checkbox"
                    checked={rememberFormat}
                    onChange={(event) =>
                      setRememberFormat(event.target.checked)
                    }
                  />
                  <span>
                    Remember this format, mapping, institution, and account
                    for next time.
                  </span>
                </label>

                <div className="connect-preview-table">
                  <div className="section-title-row">
                    <div>
                      <span className="card-kicker">
                        NORMALIZED PREVIEW
                      </span>
                      <h2>What Solpient will store</h2>
                    </div>
                    <span className="small-muted">
                      First {Math.min(8, recordCount)} rows
                    </span>
                  </div>

                  {parsed.kind === "transactions" ? (
                    <div className="data-table connect-table">
                      <div className="table-row table-head-row">
                        <span>Date</span>
                        <span>Description</span>
                        <span>Category</span>
                        <span>Amount</span>
                      </div>
                      {parsed.transactions
                        .slice(0, 8)
                        .map((transaction, index) => (
                          <div
                            className="table-row"
                            key={
                              transaction.externalId ??
                              `${transaction.postedAt}-${index}`
                            }
                          >
                            <span>{transaction.postedAt}</span>
                            <strong>{transaction.merchant}</strong>
                            <span>{transaction.category}</span>
                            <strong
                              className={
                                transaction.amount >= 0
                                  ? "positive-text"
                                  : "negative-text"
                              }
                            >
                              {money(transaction.amount)}
                            </strong>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="data-table connect-table holdings">
                      <div className="table-row table-head-row">
                        <span>Ticker</span>
                        <span>Name</span>
                        <span>Shares</span>
                        <span>Value</span>
                      </div>
                      {parsed.holdings
                        .slice(0, 8)
                        .map((holding, index) => (
                          <div
                            className="table-row"
                            key={
                              holding.externalId ??
                              `${holding.ticker}-${index}`
                            }
                          >
                            <strong>{holding.ticker}</strong>
                            <span>{holding.name}</span>
                            <span>
                              {holding.shares.toLocaleString()}
                            </span>
                            <strong>
                              {money(holding.marketValue)}
                            </strong>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {parsed.warnings.length ? (
                  <div className="connect-warning">
                    <AlertTriangle size={16} />
                    <span>
                      {parsed.warnings.length} row warning
                      {parsed.warnings.length === 1 ? "" : "s"} ·{" "}
                      {parsed.warnings[0]}
                    </span>
                  </div>
                ) : null}

                {preview ? (
                  <>
                    <div className="connect-preview-result">
                      <div>
                        <span>Total</span>
                        <strong>{preview.total}</strong>
                      </div>
                      <div>
                        <span>New</span>
                        <strong>{preview.estimatedNew}</strong>
                      </div>
                      <div>
                        <span>Updates</span>
                        <strong>{preview.estimatedUpdates}</strong>
                      </div>
                      <div>
                        <span>Duplicates</span>
                        <strong>
                          {preview.withinFileDuplicates +
                            preview.existingDuplicates}
                        </strong>
                      </div>
                    </div>
                    {preview.priorFileImport ? (
                      <div className="connect-prior-file">
                        <AlertTriangle size={15} />
                        <span>
                          This exact file was imported before on{" "}
                          {new Date(
                            preview.priorFileImport.created_at
                          ).toLocaleString()}.
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {activeAnalysis ? (
                  <div
                    className={
                      "connect-reconciliation " +
                      activeAnalysis.reconciliationStatus
                    }
                  >
                    <div className="section-title-row">
                      <div>
                        <span className="card-kicker">
                          RECONCILIATION
                        </span>
                        <h2>
                          {activeAnalysis.reconciliationStatus ===
                          "matched"
                            ? "Statement activity reconciles."
                            : activeAnalysis.reconciliationStatus ===
                                "attention"
                              ? "Review the balance gap."
                              : activeAnalysis.reconciliationStatus ===
                                  "captured"
                                ? "Statement balance captured."
                                : activeAnalysis.reconciliationStatus ===
                                    "estimated"
                                  ? "Balance estimated from activity."
                                  : "No statement balance available."}
                        </h2>
                      </div>
                      <span
                        className={
                          "connection-status " +
                          activeAnalysis.reconciliationStatus
                        }
                      >
                        {activeAnalysis.reconciliationStatus}
                      </span>
                    </div>
                    <div className="connect-reconciliation-grid">
                      <div>
                        <span>Statement</span>
                        <strong>
                          {money(activeAnalysis.statementBalance)}
                        </strong>
                      </div>
                      <div>
                        <span>Projected</span>
                        <strong>
                          {money(activeAnalysis.projectedBalance)}
                        </strong>
                      </div>
                      <div>
                        <span>Difference</span>
                        <strong>
                          {money(
                            activeAnalysis.reconciliationDelta
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Stored after import</span>
                        <strong>
                          {money(activeAnalysis.postImportBalance)}
                        </strong>
                      </div>
                    </div>
                    {activeAnalysis.anomalies.length ? (
                      <div className="connect-anomalies">
                        {activeAnalysis.anomalies.map((anomaly) => (
                          <div
                            key={anomaly.code}
                            className={anomalyTone(anomaly)}
                          >
                            <AlertTriangle size={14} />
                            <span>{anomaly.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="connect-no-anomalies">
                        <CheckCircle2 size={14} />
                        <span>No import anomalies detected.</span>
                      </div>
                    )}
                  </div>
                ) : null}

                {result ? (
                  <div className="connect-success">
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>Import complete</strong>
                      <span>
                        {result.importedRecords} records imported ·{" "}
                        {result.duplicateRecords} duplicates skipped
                        {result.remembered
                          ? " · format remembered"
                          : ""}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="connect-actions">
                  <button
                    type="button"
                    className="research-button"
                    disabled={busy !== null}
                    onClick={() => void callImport("preview")}
                  >
                    {busy === "preview"
                      ? "Checking..."
                      : "Check + reconcile"}
                  </button>
                  <button
                    type="button"
                    className="data-submit"
                    disabled={
                      busy !== null ||
                      (!accountName.trim() &&
                        targetAccountId === "__new__")
                    }
                    onClick={() => void callImport("import")}
                  >
                    {busy === "import"
                      ? "Importing..."
                      : `Import ${recordCount} records`}
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}

        {error ? (
          <div className="connect-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      <section className="card page-card connect-privacy-card">
        <ShieldCheck size={20} />
        <div>
          <strong>Local parsing, private persistence</strong>
          <span>
            The browser parses the statement. Solpient sends normalized
            records—not the original statement file—to your authenticated
            Money database.
          </span>
        </div>
      </section>
    </div>
  );
}
