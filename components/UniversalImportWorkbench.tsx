
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  Layers3,
  Link2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  parseUniversalFinancialFile,
  reconcileUniversalBundle,
  type UniversalDataset,
  type UniversalFileResult,
} from "@/lib/connect/universal-parser";

type ImportAccount = {
  id: string;
  name: string;
  institution: string;
  type: string;
  source: string;
  lastFour: string;
};

type LoadedFile = {
  id: string;
  fileName: string;
  digest: string;
  size: number;
  result: UniversalFileResult | null;
  error: string | null;
};

type GroupDataset = {
  fileName: string;
  digest: string;
  dataset: UniversalDataset;
};

type AccountGroup = {
  key: string;
  provider: string;
  accountName: string;
  accountMask: string;
  accountType: "cash" | "investment" | "retirement" | "debt";
  confidence: number;
  files: string[];
  notes: string[];
  datasets: GroupDataset[];
  companionCount: number;
  statementValue: number | null;
};

type ImportResult = {
  importedRecords: number;
  duplicateRecords: number;
  accountsUpdated: number;
  matchedTransfers: number;
  filesProcessed: number;
};

function textKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function accountMaskKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-8);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function typeLabel(value: AccountGroup["accountType"]) {
  if (value === "cash") return "Cash / checking";
  if (value === "debt") return "Credit / debt";
  if (value === "retirement") return "Retirement";
  return "Investment";
}

function recordCount(dataset: UniversalDataset) {
  return dataset.parsed.kind === "transactions"
    ? dataset.parsed.transactions.length
    : dataset.parsed.holdings.length;
}

function autoMatchAccount(group: AccountGroup, accounts: ImportAccount[]) {
  const sameType = accounts.filter((account) => account.type === group.accountType);
  const institutionMatches = sameType.filter(
    (account) => textKey(account.institution) === textKey(group.provider)
  );

  if (group.accountMask) {
    const mask = accountMaskKey(group.accountMask);
    const exact = institutionMatches.find(
      (account) => accountMaskKey(account.lastFour) === mask
    );
    if (exact) return exact.id;

    const typeMask = sameType.find(
      (account) => accountMaskKey(account.lastFour) === mask
    );
    if (typeMask) return typeMask.id;
  }

  const nameMatch = institutionMatches.find(
    (account) => textKey(account.name) === textKey(group.accountName)
  );
  if (nameMatch) return nameMatch.id;

  if (institutionMatches.length === 1) return institutionMatches[0].id;

  return null;
}

function buildGroups(files: LoadedFile[]): AccountGroup[] {
  const valid = files.filter(
    (file): file is LoadedFile & { result: UniversalFileResult } =>
      Boolean(file.result)
  );

  const reconciled = reconcileUniversalBundle(valid.map((file) => file.result));
  const groups = new Map<string, AccountGroup>();

  for (let resultIndex = 0; resultIndex < reconciled.length; resultIndex += 1) {
    const result = reconciled[resultIndex];
    const sourceFile = valid[resultIndex];
    const current: AccountGroup =
      groups.get(result.accountKey) ??
      {
        key: result.accountKey,
        provider: result.provider,
        accountName: result.accountName,
        accountMask: result.accountMask,
        accountType: result.accountType,
        confidence: result.confidence,
        files: [],
        notes: [],
        datasets: [],
        companionCount: 0,
        statementValue: null,
      };

    if (!current.files.includes(result.fileName)) current.files.push(result.fileName);

    for (const note of result.notes) {
      if (!current.notes.includes(note)) current.notes.push(note);
    }

    current.confidence = Math.max(current.confidence, result.confidence);

    if (result.companion) {
      current.companionCount += 1;
      current.statementValue = result.companion.netValue;
    }

    for (const dataset of result.datasets) {
      if (!sourceFile) continue;

      current.datasets.push({
        fileName: result.fileName,
        digest: sourceFile.digest,
        dataset,
      });

      const candidate = dataset.parsed.closingBalance;
      if (candidate != null && Number.isFinite(candidate)) {
        current.statementValue = candidate;
      }
    }

    groups.set(result.accountKey, current);
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) ||
      a.accountName.localeCompare(b.accountName)
  );
}

export default function UniversalImportWorkbench({
  accounts,
}: {
  accounts: ImportAccount[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"reading" | "importing" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [targetOverrides, setTargetOverrides] = useState<Record<string, string>>(
    {}
  );

  const groups = useMemo(() => buildGroups(files), [files]);

  const validFileCount = files.filter((file) => file.result).length;
  const errorFileCount = files.filter((file) => file.error).length;

  const totalRecords = groups.reduce(
    (sum, group) =>
      sum +
      group.datasets.reduce(
        (inner, item) => inner + recordCount(item.dataset),
        0
      ),
    0
  );

  const totalHoldings = groups.reduce(
    (sum, group) =>
      sum +
      group.datasets.reduce(
        (inner, item) =>
          inner +
          (item.dataset.parsed.kind === "holdings"
            ? item.dataset.parsed.holdings.length
            : 0),
        0
      ),
    0
  );

  const totalTransactions = groups.reduce(
    (sum, group) =>
      sum +
      group.datasets.reduce(
        (inner, item) =>
          inner +
          (item.dataset.parsed.kind === "transactions"
            ? item.dataset.parsed.transactions.length
            : 0),
        0
      ),
    0
  );

  function selectedTarget(group: AccountGroup) {
    return (
      targetOverrides[group.key] ??
      autoMatchAccount(group, accounts) ??
      "__new__"
    );
  }

  async function loadFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    if (!list.length) return;

    setBusy("reading");
    setError(null);
    setResult(null);
    setProgress("Reading " + list.length + " file" + (list.length === 1 ? "" : "s") + "…");

    const next: LoadedFile[] = [];

    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      setProgress(
        "Analyzing " +
          (index + 1) +
          " of " +
          list.length +
          ": " +
          file.name
      );

      if (file.size > 15 * 1024 * 1024) {
        next.push({
          id: file.name + "-" + file.size + "-" + index,
          fileName: file.name,
          digest: "",
          size: file.size,
          result: null,
          error: "File exceeds the 15 MB limit.",
        });
        continue;
      }

      const extension = file.name.toLowerCase().split(".").pop();
      if (!["csv", "qfx", "ofx"].includes(extension ?? "")) {
        next.push({
          id: file.name + "-" + file.size + "-" + index,
          fileName: file.name,
          digest: "",
          size: file.size,
          result: null,
          error: "Use CSV, QFX, or OFX.",
        });
        continue;
      }

      try {
        const text = await file.text();
        const digest = await sha256(text);
        const parsed = parseUniversalFinancialFile(file.name, text);

        next.push({
          id: file.name + "-" + digest.slice(0, 12),
          fileName: file.name,
          digest,
          size: file.size,
          result: parsed,
          error: null,
        });
      } catch (readError) {
        next.push({
          id: file.name + "-" + file.size + "-" + index,
          fileName: file.name,
          digest: "",
          size: file.size,
          result: null,
          error:
            readError instanceof Error
              ? readError.message
              : "Unable to analyze this file.",
        });
      }
    }

    setFiles((current) => {
      const merged = [...current];

      for (const candidate of next) {
        const duplicateIndex = merged.findIndex(
          (existing) =>
            Boolean(candidate.digest) &&
            existing.digest === candidate.digest
        );

        if (duplicateIndex >= 0) {
          merged[duplicateIndex] = candidate;
        } else {
          merged.push(candidate);
        }
      }

      return merged;
    });
    setBusy(null);
    setProgress("");
  }

  function removeFile(fileId: string) {
    setFiles((current) =>
      current.filter((file) => file.id !== fileId)
    );
    setResult(null);
    setError(null);
  }

  function clearAll() {
    setFiles([]);
    setTargetOverrides({});
    setError(null);
    setResult(null);
    setProgress("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function importEverything() {
    if (!groups.length || errorFileCount > 0) {
      setError(
        errorFileCount > 0
          ? "Fix or remove files with detection errors before importing."
          : "Add financial files first."
      );
      return;
    }

    const emptyGroups = groups.filter((group) => group.datasets.length === 0);
    if (emptyGroups.length) {
      setError(
        emptyGroups.map((group) => group.accountName).join(", ") +
          " has only an account summary. Add the matching holdings/activity file before importing."
      );
      return;
    }

    setBusy("importing");
    setError(null);
    setResult(null);

    let importedRecords = 0;
    let duplicateRecords = 0;
    const accountIds = new Set<string>();
    const createdByGroup = new Map<string, string>();
    const completedBatchIds: string[] = [];
    let completedDatasets = 0;
    const allDatasets = groups.reduce(
      (sum, group) => sum + group.datasets.length,
      0
    );

    try {
      for (const group of groups) {
        const selection = selectedTarget(group);
        let resolvedAccountId = selection === "__new__" ? null : selection;

        for (const item of group.datasets) {
          completedDatasets += 1;
          setProgress(
            "Importing " +
              completedDatasets +
              " of " +
              allDatasets +
              ": " +
              item.dataset.sourceLabel
          );

          if (!resolvedAccountId) {
            resolvedAccountId = createdByGroup.get(group.key) ?? null;
          }

          const response = await fetch("/api/connect/file-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "import",
              fileName: item.fileName,
              fileDigest: item.digest,
              parsed: item.dataset.parsed,
              rememberFormat: item.dataset.sourceId === "generic",
              targetAccountId: resolvedAccountId,
              newAccount: resolvedAccountId
                ? undefined
                : {
                    name: group.accountName,
                    institution: group.provider,
                    accountType: group.accountType,
                    lastFour: group.accountMask,
                  },
            }),
          });

          const body = await response.json();

          if (!response.ok) {
            throw new Error(
              item.fileName + ": " + (body.error ?? "Import failed.")
            );
          }

          const batchId = String(body.batchId ?? "");
          if (batchId) {
            completedBatchIds.push(batchId);
          }

          const accountId = String(body.accountId ?? "");
          if (accountId) {
            resolvedAccountId = accountId;
            createdByGroup.set(group.key, accountId);
            accountIds.add(accountId);
          }

          importedRecords += Number(body.importedRecords ?? 0);
          duplicateRecords += Number(body.duplicateRecords ?? 0);
        }
      }

      setProgress("Reconciling transfers, duplicates, and account identity…");

      const truthResponse = await fetch("/api/connect/reconcile", {
        method: "POST",
      });
      const truthBody = await truthResponse.json();

      if (!truthResponse.ok) {
        throw new Error(
          truthBody.error ??
            "Imports completed, but reconciliation failed."
        );
      }

      setResult({
        importedRecords,
        duplicateRecords,
        accountsUpdated: accountIds.size,
        matchedTransfers: Number(
          truthBody.summary?.detectedTransfers ?? 0
        ),
        filesProcessed: validFileCount,
      });

      setProgress("");
      router.refresh();
    } catch (importError) {
      let rollbackFailures = 0;

      if (completedBatchIds.length) {
        setProgress(
          "Import failed. Rolling back completed batches…"
        );

        for (
          const batchId of [...completedBatchIds].reverse()
        ) {
          try {
            const rollbackResponse = await fetch(
              "/api/connect/undo",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ batchId }),
              }
            );

            if (!rollbackResponse.ok) {
              rollbackFailures += 1;
            }
          } catch {
            rollbackFailures += 1;
          }
        }
      }

      const message =
        importError instanceof Error
          ? importError.message
          : "Universal import failed.";

      setError(
        rollbackFailures > 0
          ? message +
              " Some completed batches could not be rolled back automatically; review Import History."
          : completedBatchIds.length > 0
            ? message +
              " Completed batches were rolled back."
            : message
      );
      setProgress("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="universal-import" className="card page-card universal-import">
      <div className="section-title-row">
        <div>
          <span className="card-kicker">UNIVERSAL FINANCIAL IMPORT</span>
          <h2>Drop your financial files. Solpient maps the rest.</h2>
        </div>
        <span className="connect-free-pill">LOCAL · DETERMINISTIC</span>
      </div>

      <p className="universal-import-copy">
        Upload checking, credit-card, brokerage, retirement, CSV, QFX, or OFX
        files together. Solpient detects the institution and account, separates
        holdings from activity, avoids duplicate rows, reconciles internal
        transfers, and updates the same financial model used by Overview, Cash
        Flow, Portfolio, Allocation, Debt, and Net Worth.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.qfx,.ofx,text/csv,application/x-ofx"
        hidden
        onChange={(event) => {
          if (event.target.files) {
            void loadFiles(event.target.files);
          }
          event.currentTarget.value = "";
        }}
      />

      {!files.length ? (
        <div
          className={"connect-dropzone universal" + (dragging ? " dragging" : "")}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void loadFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <FileUp size={30} />
          <strong>
            {busy === "reading"
              ? "Analyzing files…"
              : "Drop all financial files here"}
          </strong>
          <span>Multiple CSV · QFX · OFX files · up to 15 MB each</span>
          <button type="button">Choose financial files</button>
        </div>
      ) : (
        <>
          <div className="universal-summary-grid">
            <div>
              <FileSpreadsheet size={17} />
              <span>Files recognized</span>
              <strong>
                {validFileCount}/{files.length}
              </strong>
            </div>
            <div>
              <Database size={17} />
              <span>Accounts detected</span>
              <strong>{groups.length}</strong>
            </div>
            <div>
              <Layers3 size={17} />
              <span>Holdings</span>
              <strong>{totalHoldings}</strong>
            </div>
            <div>
              <Link2 size={17} />
              <span>Transactions</span>
              <strong>{totalTransactions}</strong>
            </div>
          </div>

          <div className="universal-file-list">
            {files.map((file) => (
              <div
                className={"universal-file-row" + (file.error ? " error" : "")}
                key={file.id}
              >
                <span className="connect-file-icon">
                  {file.error ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </span>
                <div>
                  <strong>{file.fileName}</strong>
                  <span>
                    {file.error
                      ? file.error
                      : (file.result?.provider ?? "Unknown") +
                        " · " +
                        (file.result?.sourceId.replaceAll("-", " ") ?? "") +
                        " · " +
                        Math.round((file.result?.confidence ?? 0) * 100) +
                        "% confidence"}
                  </span>
                </div>
                <span
                  className={
                    "connection-status " +
                    (file.error ? "attention" : "matched")
                  }
                >
                  {file.error ? "needs review" : "recognized"}
                </span>
                <button
                  type="button"
                  className="icon-button universal-file-remove"
                  aria-label={"Remove " + file.fileName}
                  onClick={() => removeFile(file.id)}
                  disabled={busy !== null}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="universal-account-list">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">ACCOUNT ROUTING</span>
                <h2>Where the numbers will go</h2>
              </div>
              <span className="small-muted">
                {totalRecords.toLocaleString()} normalized records
              </span>
            </div>

            {groups.map((group) => {
              const target = selectedTarget(group);
              const matched = target !== "__new__";

              return (
                <div className="universal-account-row" key={group.key}>
                  <div className="universal-account-main">
                    <span className="connect-file-icon">
                      <Sparkles size={16} />
                    </span>
                    <div>
                      <strong>{group.accountName}</strong>
                      <span>
                        {group.provider} · {typeLabel(group.accountType)}
                        {group.accountMask ? " · •••• " + group.accountMask : ""}
                      </span>
                    </div>
                  </div>

                  <div className="universal-account-stats">
                    <span>
                      {group.files.length} file
                      {group.files.length === 1 ? "" : "s"}
                    </span>
                    <span>
                      {group.datasets.reduce(
                        (sum, item) => sum + recordCount(item.dataset),
                        0
                      )}{" "}
                      records
                    </span>
                    <strong>{money(group.statementValue)}</strong>
                  </div>

                  <label className="universal-route-select">
                    <span>Destination</span>
                    <select
                      value={target}
                      onChange={(event) =>
                        setTargetOverrides((current) => ({
                          ...current,
                          [group.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="__new__">Create new account</option>
                      {accounts
                        .filter((account) => account.type === group.accountType)
                        .map((account) => (
                          <option value={account.id} key={account.id}>
                            {account.name} · {account.institution}
                          </option>
                        ))}
                    </select>
                    <small>
                      {matched
                        ? "Matched to an existing account"
                        : "A new account will be created"}
                    </small>
                  </label>

                  {group.notes.length ? (
                    <div className="universal-account-note">
                      {group.notes[0]}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {result ? (
            <div className="universal-result">
              <CheckCircle2 size={20} />
              <div>
                <strong>Financial model updated</strong>
                <span>
                  {result.filesProcessed} files · {result.accountsUpdated}{" "}
                  accounts · {result.importedRecords} records imported ·{" "}
                  {result.duplicateRecords} duplicates skipped ·{" "}
                  {result.matchedTransfers} transfer groups detected
                </span>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="connect-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          {progress ? (
            <div className="universal-progress">
              <RefreshCw size={15} />
              <span>{progress}</span>
            </div>
          ) : null}

          <div className="universal-actions">
            <button
              type="button"
              className="research-button"
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
            >
              <FileUp size={14} />
              Add files
            </button>
            <button
              type="button"
              className="research-button"
              onClick={clearAll}
              disabled={busy !== null}
            >
              <X size={14} />
              Clear
            </button>
            <button
              type="button"
              className="data-submit"
              onClick={() => void importEverything()}
              disabled={
                busy !== null || errorFileCount > 0 || groups.length === 0
              }
            >
              {busy === "importing"
                ? "Importing financial model…"
                : "Import all " + validFileCount + " files"}
            </button>
          </div>
        </>
      )}

      <div className="bottom-note universal">
        <CheckCircle2 size={15} />
        <span>
          Raw files stay in browser memory only. Solpient persists normalized
          accounts, transactions, holdings, file fingerprints, reconciliation
          history, and your learned account mappings.
        </span>
      </div>
    </section>
  );
}
