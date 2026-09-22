"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

export default function UndoImportButton({
  batchId,
  fileName,
}: {
  batchId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    if (
      !window.confirm(
        `Undo the import from "${fileName}"? Solpient will remove rows from this batch and restore the prior account state.`
      )
    ) {
      return;
    }

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
        throw new Error(body.error ?? "Unable to undo this import.");
      }
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
      <button type="button" onClick={undo} disabled={busy}>
        <RotateCcw size={13} />
        {busy ? "Undoing..." : "Undo"}
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
