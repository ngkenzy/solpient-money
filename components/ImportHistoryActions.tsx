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
  const [busy, setBusy] = useState<"undo" | "delete" | "force" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"undo" | "delete" | "force" | null>(null);

  async function undo() {
    if (confirming !== "undo") {
      setConfirming("undo");
      setError(null);
      return;
    }

    setConfirming(null);
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

  async function forceDelete() {
    if (confirming !== "force") {
      setConfirming("force");
      setError(null);
      return;
    }

    setConfirming(null);
    setBusy("force");
    setError(null);

    try {
      const response = await fetch(
        "/api/connect/force-delete-import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        }
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Unable to force-delete this import."
        );
      }

      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to force-delete this import."
      );
    } finally {
      setBusy(null);
    }
  }

  async function permanentlyDelete() {
    if (confirming !== "delete") {
      setConfirming("delete");
      setError(null);
      return;
    }

    setConfirming(null);
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
          {busy === "undo"
            ? "Undoing..."
            : confirming === "undo"
              ? "Confirm undo"
              : "Undo"}
        </button>
      ) : null}

      <button
        type="button"
        className="danger"
        onClick={permanentlyDelete}
        disabled={busy !== null}
      >
        <Trash2 size={13} />
        {busy === "delete"
          ? "Deleting..."
          : confirming === "delete"
            ? "Confirm delete"
            : "Delete"}
      </button>

      <button
        type="button"
        className="danger force"
        onClick={forceDelete}
        disabled={busy !== null}
      >
        <Trash2 size={13} />
        {busy === "force"
          ? "Force deleting..."
          : confirming === "force"
            ? "Confirm force delete"
            : "Force delete"}
      </button>

      {confirming ? (
        <div className="connect-action-confirmation">
          Click the highlighted action again to confirm.
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={busy !== null}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="connect-action-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
