"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  parseFinancialFile,
  type ParsedFinancialFile,
} from "@/lib/connect/file-parser";

type ImportAccount = {
  id: string;
  name: string;
  institution: string;
  type: string;
  source: string;
};

type PreviewResult = {
  total: number;
  withinFileDuplicates: number;
  existingDuplicates: number;
  estimatedNew: number;
  priorFileImport: {
    id: string;
    created_at: string;
    imported_records: number;
    duplicate_records: number;
  } | null;
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function FileImportWorkbench({ accounts }: { accounts: ImportAccount[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileDigest, setFileDigest] = useState("");
  const [parsed, setParsed] = useState<ParsedFinancialFile | null>(null);
  const [targetAccountId, setTargetAccountId] = useState("__new__");
  const [accountName, setAccountName] = useState("");
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState<"cash" | "investment" | "retirement" | "debt">("cash");
  const [lastFour, setLastFour] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState<"parse" | "preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ importedRecords: number; duplicateRecords: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  async function loadFile(file: File) {
    setBusy("parse");
    setError(null);
    setPreview(null);
    setResult(null);

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Connect V1 accepts files up to 10 MB.");
      }
      const extension = file.name.toLowerCase().split(".").pop();
      if (!["csv", "qfx", "ofx"].includes(extension ?? "")) {
        throw new Error("Use a CSV, QFX, or OFX file.");
      }

      const text = await file.text();
      const next = parseFinancialFile(file.name, text);
      const hash = await sha256(text);

      setFileName(file.name);
      setFileDigest(hash);
      setParsed(next);
      setAccountName(next.accountName);
      setInstitution(next.institutionGuess || "File import");
      setAccountType(next.accountType);
      setLastFour(next.accountMask);
      setTargetAccountId("__new__");
    } catch (loadError) {
      setParsed(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to read this file.");
    } finally {
      setBusy(null);
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
          targetAccountId: targetAccountId === "__new__" ? null : targetAccountId,
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
        });
        setPreview(null);
        router.refresh();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Import request failed.");
    } finally {
      setBusy(null);
    }
  }

  function clear() {
    setFileName("");
    setFileDigest("");
    setParsed(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const recordCount = parsed
    ? parsed.kind === "transactions"
      ? parsed.transactions.length
      : parsed.holdings.length
    : 0;

  return (
    <div className="connect-workbench">
      <section className="card page-card connect-upload-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">NATIVE FILE CONNECTOR</span>
            <h2>Import CSV, QFX, or OFX</h2>
          </div>
          <span className="connect-free-pill">NO AGGREGATOR FEE</span>
        </div>

        {!parsed ? (
          <div
            className={"connect-dropzone" + (dragging ? " dragging" : "")}
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
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
          >
            <FileUp size={28} />
            <strong>{busy === "parse" ? "Reading statement..." : "Drop a financial file here"}</strong>
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
              <span className="connect-file-icon"><FileSpreadsheet size={22} /></span>
              <div>
                <strong>{fileName}</strong>
                <span>{parsed.format.toUpperCase()} · {parsed.kind} · {recordCount} detected records</span>
              </div>
              <button type="button" className="icon-button" onClick={clear} aria-label="Remove file"><X size={16} /></button>
            </div>

            <div className="connect-detection-grid">
              <div><span>Format</span><strong>{parsed.format.toUpperCase()}</strong></div>
              <div><span>Detected</span><strong>{parsed.kind === "transactions" ? "Transactions" : "Holdings"}</strong></div>
              <div><span>Institution</span><strong>{parsed.institutionGuess || "Not embedded"}</strong></div>
              <div><span>Closing value</span><strong>{parsed.closingBalance == null ? "—" : money(parsed.closingBalance)}</strong></div>
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
                  <option value="__new__">Create a new account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.institution}
                    </option>
                  ))}
                </select>
              </label>

              {targetAccountId === "__new__" ? (
                <div className="connect-new-account-grid">
                  <label><span>Account name</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label>
                  <label><span>Institution</span><input value={institution} onChange={(event) => setInstitution(event.target.value)} /></label>
                  <label>
                    <span>Account type</span>
                    <select value={accountType} onChange={(event) => setAccountType(event.target.value as typeof accountType)}>
                      <option value="cash">Cash / bank</option>
                      <option value="investment">Investment</option>
                      <option value="retirement">Retirement</option>
                      <option value="debt">Debt / credit</option>
                    </select>
                  </label>
                  <label><span>Last four</span><input maxLength={8} value={lastFour} onChange={(event) => setLastFour(event.target.value)} placeholder="Optional" /></label>
                </div>
              ) : null}
            </div>

            <div className="connect-preview-table">
              <div className="section-title-row">
                <div><span className="card-kicker">NORMALIZED PREVIEW</span><h2>What Solpient will store</h2></div>
                <span className="small-muted">First {Math.min(8, recordCount)} rows</span>
              </div>

              {parsed.kind === "transactions" ? (
                <div className="data-table connect-table">
                  <div className="table-row table-head-row"><span>Date</span><span>Description</span><span>Category</span><span>Amount</span></div>
                  {parsed.transactions.slice(0, 8).map((transaction, index) => (
                    <div className="table-row" key={transaction.externalId ?? `${transaction.postedAt}-${index}`}>
                      <span>{transaction.postedAt}</span>
                      <strong>{transaction.merchant}</strong>
                      <span>{transaction.category}</span>
                      <strong className={transaction.amount >= 0 ? "positive-text" : "negative-text"}>{money(transaction.amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="data-table connect-table holdings">
                  <div className="table-row table-head-row"><span>Ticker</span><span>Name</span><span>Shares</span><span>Value</span></div>
                  {parsed.holdings.slice(0, 8).map((holding, index) => (
                    <div className="table-row" key={holding.externalId ?? `${holding.ticker}-${index}`}>
                      <strong>{holding.ticker}</strong>
                      <span>{holding.name}</span>
                      <span>{holding.shares.toLocaleString()}</span>
                      <strong>{money(holding.marketValue)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {parsed.warnings.length ? (
              <div className="connect-warning">
                <AlertTriangle size={16} />
                <span>{parsed.warnings.length} row warning{parsed.warnings.length === 1 ? "" : "s"} · {parsed.warnings[0]}</span>
              </div>
            ) : null}

            {preview ? (
              <div className="connect-preview-result">
                <div><span>Total</span><strong>{preview.total}</strong></div>
                <div><span>New</span><strong>{preview.estimatedNew}</strong></div>
                <div><span>Duplicates</span><strong>{preview.withinFileDuplicates + preview.existingDuplicates}</strong></div>
                <div><span>Same file before</span><strong>{preview.priorFileImport ? "Yes" : "No"}</strong></div>
              </div>
            ) : null}

            {result ? (
              <div className="connect-success">
                <CheckCircle2 size={18} />
                <div><strong>Import complete</strong><span>{result.importedRecords} records imported · {result.duplicateRecords} duplicates skipped/updated</span></div>
              </div>
            ) : null}

            {error ? <div className="connect-error"><AlertTriangle size={16} /><span>{error}</span></div> : null}

            <div className="connect-actions">
              <button type="button" className="research-button" disabled={busy !== null} onClick={() => void callImport("preview")}>
                {busy === "preview" ? "Checking..." : "Check duplicates"}
              </button>
              <button type="button" className="data-submit" disabled={busy !== null || !accountName.trim() && targetAccountId === "__new__"} onClick={() => void callImport("import")}>
                {busy === "import" ? "Importing..." : `Import ${recordCount} records`}
              </button>
            </div>
          </>
        )}

        {error && !parsed ? <div className="connect-error"><AlertTriangle size={16} /><span>{error}</span></div> : null}
      </section>

      <section className="card page-card connect-privacy-card">
        <ShieldCheck size={20} />
        <div>
          <strong>Local parsing, private persistence</strong>
          <span>The browser parses the statement. Solpient sends normalized records—not the original statement file—to your authenticated Money database.</span>
        </div>
      </section>
    </div>
  );
}
