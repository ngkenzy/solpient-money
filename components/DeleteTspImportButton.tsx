"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  ImportActionAlert,
  ImportActionConfirm,
} from "./ImportActionConfirm";

export default function DeleteTspImportButton({
  importId,
  fileName,
  isStatementImport,
}: {
  importId: string;
  fileName: string;
  /** True for v1.8 statement imports: delete removes the import and its
   *  confirmed snapshot revision. Live holdings are never touched by the
   *  statement flow, so there is no previous-import restore. */
  isStatementImport?: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    null
  );

  async function execute() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/tsp/delete-import",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ importId }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Unable to delete this TSP import."
        );
      }

      setArmed(false);
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this TSP import."
      );
    } finally {
      setBusy(false);
    }
  }

  const detail = isStatementImport
    ? `Permanently delete TSP statement import "${fileName}"? This removes the import and its confirmed snapshot revision. Your live holdings are not affected. This cannot be undone.`
    : `Permanently delete TSP import "${fileName}"? If this is the newest TSP CSV, Solpient will restore the previous TSP import when one exists. This cannot be undone.`;

  return (
    <div className="connect-import-actions tsp-delete">
      {!armed ? (
        <button
          type="button"
          className="danger"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          disabled={busy}
        >
          <Trash2 size={13} />
          Delete
        </button>
      ) : (
        <ImportActionConfirm
          title="Delete this TSP import?"
          detail={detail}
          confirmLabel="Confirm delete"
          busyLabel="Deleting…"
          busy={busy}
          onConfirm={() => void execute()}
          onCancel={() => setArmed(false)}
        />
      )}
      {error ? (
        <ImportActionAlert message={error} />
      ) : null}
    </div>
  );
}
