"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  ImportActionAlert,
  ImportActionConfirm,
} from "./ImportActionConfirm";

type Action = "undo" | "delete" | "force";

const CONFIRM_COPY: Record<
  Action,
  { title: string; confirmLabel: string; busyLabel: string }
> = {
  undo: {
    title: "Undo this import?",
    confirmLabel: "Confirm undo",
    busyLabel: "Undoing…",
  },
  delete: {
    title: "Permanently delete this import?",
    confirmLabel: "Confirm delete",
    busyLabel: "Deleting…",
  },
  force: {
    title: "Force-delete this import?",
    confirmLabel: "Confirm force delete",
    busyLabel: "Force deleting…",
  },
};

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
  const [armed, setArmed] = useState<Action | null>(
    null
  );
  const [busy, setBusy] = useState<Action | null>(
    null
  );
  const [error, setError] = useState<string | null>(
    null
  );

  function detailFor(action: Action): string {
    if (action === "undo") {
      return `Undo the import from "${fileName}"? Solpient will remove rows from this batch and restore the prior account state, but keep the audit record.`;
    }
    if (action === "force") {
      return `Force-delete "${fileName}" and all financial rows still tagged to that import? This bypasses rollback restoration for legacy/broken imports, then recalculates the affected account from remaining data. This cannot be undone.`;
    }
    return `Permanently delete "${fileName}" and the data imported from it? This removes the imported financial rows and its import-history record. This cannot be undone.`;
  }

  async function postJson(
    path: string,
    payload: Record<string, string>
  ) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body.error ?? "Request failed."
      );
    }
    return body;
  }

  async function postJsonSoft(
    path: string,
    payload: Record<string, string>
  ): Promise<{ ok: boolean; body: any }> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    return { ok: response.ok, body };
  }

  async function execute(action: Action) {
    setBusy(action);
    setError(null);

    try {
      if (action === "undo") {
        await postJson("/api/connect/undo", {
          batchId,
        });
      } else if (action === "force") {
        await postJson(
          "/api/connect/force-delete-import",
          { batchId }
        );
      } else {
        // Permanent delete keeps the original undo-fallback: when the
        // history endpoint reports requiresUndo, undo the batch first,
        // then delete the history record.
        const first = await postJsonSoft(
          "/api/connect/delete-import",
          { batchId }
        );

        let final = first;
        if (
          !first.ok &&
          first.body?.requiresUndo === true &&
          status === "imported"
        ) {
          await postJson("/api/connect/undo", {
            batchId,
          });
          final = await postJsonSoft(
            "/api/connect/delete-import",
            { batchId }
          );
        }

        if (!final.ok) {
          throw new Error(
            final.body?.error ??
              "Unable to delete this import history."
          );
        }
      }

      setArmed(null);
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to complete this action."
      );
    } finally {
      setBusy(null);
    }
  }

  const executing = busy !== null;

  return (
    <div className="connect-import-actions">
      {armed === null ? (
        <>
          {status === "imported" ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setError(null);
                setArmed("undo");
              }}
              disabled={executing}
            >
              <RotateCcw size={13} />
              Undo
            </button>
          ) : null}

          <button
            type="button"
            className="danger"
            onClick={() => {
              setError(null);
              setArmed("delete");
            }}
            disabled={executing}
          >
            <Trash2 size={13} />
            Delete
          </button>

          <button
            type="button"
            className="danger force"
            onClick={() => {
              setError(null);
              setArmed("force");
            }}
            disabled={executing}
          >
            <Trash2 size={13} />
            Force delete
          </button>
        </>
      ) : (
        <ImportActionConfirm
          title={CONFIRM_COPY[armed].title}
          detail={detailFor(armed)}
          confirmLabel={
            CONFIRM_COPY[armed].confirmLabel
          }
          busyLabel={CONFIRM_COPY[armed].busyLabel}
          busy={executing}
          onConfirm={() => void execute(armed)}
          onCancel={() => setArmed(null)}
        />
      )}

      {error ? (
        <ImportActionAlert message={error} />
      ) : null}
    </div>
  );
}
