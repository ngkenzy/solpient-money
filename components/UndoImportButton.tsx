"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import {
  ImportActionAlert,
  ImportActionConfirm,
} from "./ImportActionConfirm";

export default function UndoImportButton({
  batchId,
  fileName,
}: {
  batchId: string;
  fileName: string;
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
      setArmed(false);
      router.refresh();
    } catch (undoError) {
      setError(
        undoError instanceof Error
          ? undoError.message
          : "Unable to undo this import."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connect-undo">
      {!armed ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          disabled={busy}
        >
          <RotateCcw size={13} />
          Undo
        </button>
      ) : (
        <ImportActionConfirm
          title="Undo this import?"
          detail={`Undo the import from "${fileName}"? Solpient will remove rows from this batch and restore the prior account state.`}
          confirmLabel="Confirm undo"
          busyLabel="Undoing…"
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
