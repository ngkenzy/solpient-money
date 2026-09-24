"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";

export default function ImportHistoryActions({
  batchId,
  fileName,
  status,
}: {
  batchId: string;
  fileName: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"undo" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    if (
      !window.confirm(
        `Undo the import from "${fileName}"? Solpient will remove rows from this batch and restore the prior account state, but keep the audit record.`
      )
    ) {
      return;
    }

    setBusy("undo");
    setError(null);

    try {
      const response = await fetch("/api/connect/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Unable to undo this import."
        );
      }

      router.refresh();
    } catch (undoError) {
      setError(
        undoError instanceof Error
          ? undoError.message
          : "Unable to undo this import."
      );
    } finally {
      setBusy(null);
    }
  }

  async function permanentlyDelete() {
    if (
      !window.confirm(
        `Permanently delete "${fileName}" and the data imported from it?\n\nThis removes the imported financial rows and its import-history record. This cannot be undone.`
      )
    ) {
      return;
    }

    setBusy("delete");
    setError(null);

    try {
      let deleteResponse = await fetch(
        "/api/connect/delete-import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        }
      );
      let deleteBody = await deleteResponse.json();

      if (
        !deleteResponse.ok &&
        deleteBody.requiresUndo === true &&
        status === "imported"
      ) {
        const undoResponse = await fetch("/api/connect/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        });
        const undoBody = await undoResponse.json();

        if (!undoResponse.ok) {
          throw new Error(
            undoBody.error ??
              "Unable to remove this import's financial data."
          );
        }

        deleteResponse = await fetch(
          "/api/connect/delete-import",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchId }),
          }
        );
        deleteBody = await deleteResponse.json();
      }

      if (!deleteResponse.ok) {
        throw new Error(
          deleteBody.error ??
            "Unable to delete this import history."
        );
      }

      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to permanently delete this import."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="connect-import-actions">
      {status === "imported" ? (
        <button
          type="button"
          className="secondary"
          onClick={undo}
          disabled={busy !== null}
        >
          <RotateCcw size={13} />
          {busy === "undo" ? "Undoing..." : "Undo"}
        </button>
      ) : null}

      <button
        type="button"
        className="danger"
        onClick={permanentlyDelete}
        disabled={busy !== null}
      >
        <Trash2 size={13} />
        {busy === "delete" ? "Deleting..." : "Delete"}
      </button>

      {error ? <small>{error}</small> : null}
    </div>
  );
}
