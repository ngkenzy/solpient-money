"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteTspImportButton({
  importId,
  fileName,
}: {
  importId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Permanently delete TSP import "${fileName}"?\n\nIf this is the newest TSP CSV, Solpient will restore the previous TSP import when one exists. This cannot be undone.`
      )
    ) {
      return;
    }

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

  return (
    <div className="connect-import-actions tsp-delete">
      <button
        type="button"
        className="danger"
        onClick={remove}
        disabled={busy}
      >
        <Trash2 size={13} />
        {busy ? "Deleting..." : "Delete"}
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
