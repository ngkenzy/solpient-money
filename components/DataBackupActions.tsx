"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import {
  ImportActionAlert,
  ImportActionConfirm,
} from "./ImportActionConfirm";

type Phase =
  | "idle"
  | "backing-up"
  | "restore-armed"
  | "restoring";

function filenameFromDisposition(
  header: string | null
): string {
  const match = header?.match(
    /filename="([^"]+)"/
  );
  return (
    match?.[1] ??
    "solpient-money-backup.sql.gz.enc"
  );
}

export default function DataBackupActions() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] =
    useState<Phase>("idle");
  const [pendingName, setPendingName] =
    useState<string>("");
  const [error, setError] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<
    string | null
  >(null);

  const busy =
    phase === "backing-up" ||
    phase === "restoring";

  async function runBackup() {
    setPhase("backing-up");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        "/api/data/backup",
        { method: "POST" }
      );
      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({}));
        throw new Error(
          body.error ?? "Backup failed."
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor =
        document.createElement("a");
      anchor.href = url;
      anchor.download =
        filenameFromDisposition(
          response.headers.get(
            "Content-Disposition"
          )
        );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(
        "Encrypted backup downloaded — keep a copy off this Mac."
      );
      router.refresh();
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : "Backup failed."
      );
    } finally {
      setPhase("idle");
    }
  }

  function onFileChosen() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    setPendingName(file.name);
    setPhase("restore-armed");
  }

  function cancelRestore() {
    if (fileRef.current)
      fileRef.current.value = "";
    setPendingName("");
    setPhase("idle");
  }

  async function runRestore() {
    const file =
      fileRef.current?.files?.[0];
    if (!file) {
      cancelRestore();
      return;
    }
    setPhase("restoring");
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        "/api/data/restore",
        { method: "POST", body: form }
      );
      const body = await response
        .json()
        .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          body.error ?? "Restore failed."
        );
      }
      setNotice(
        "Restore complete — your data is back."
      );
      cancelRestore();
      router.refresh();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Restore failed."
      );
      setPhase("idle");
    }
  }

  return (
    <div className="data-backup-actions">
      <input
        ref={fileRef}
        type="file"
        accept=".enc"
        className="visually-hidden"
        aria-label="Choose an encrypted backup file"
        onChange={onFileChosen}
      />
      {phase === "restore-armed" ? (
        <ImportActionConfirm
          title="Restore from this backup?"
          detail={`Restore "${pendingName}"? This replaces ALL current data with the backup contents. Anything changed since the backup was created will be lost. This cannot be undone.`}
          confirmLabel="Confirm restore"
          busyLabel="Restoring…"
          busy={busy}
          onConfirm={() => void runRestore()}
          onCancel={cancelRestore}
        />
      ) : (
        <div className="data-backup-buttons">
          <button
            type="button"
            className="secondary"
            onClick={() => void runBackup()}
            disabled={busy}
          >
            <Download size={14} />
            {phase === "backing-up"
              ? "Creating backup…"
              : "Download backup"}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() =>
              fileRef.current?.click()
            }
            disabled={busy}
          >
            <Upload size={14} />
            Restore from backup
          </button>
        </div>
      )}
      {notice ? (
        <p className="data-backup-notice">
          {notice}
        </p>
      ) : null}
      {error ? (
        <ImportActionAlert message={error} />
      ) : null}
    </div>
  );
}
