"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { ConnectorId } from "@/lib/connect/sdk";

export default function ConnectorSyncButton({
  connectorId,
  instanceId,
  label = "Sync",
}: {
  connectorId: ConnectorId;
  instanceId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/connect/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId, instanceId }),
      });
      const body = await response.json();

      if (!response.ok || body.ok === false) {
        const resultError = Array.isArray(body.results)
          ? body.results.find(
              (result: { ok?: boolean }) => result.ok === false
            )?.error
          : null;
        throw new Error(
          resultError ?? body.error ?? "Connector sync failed."
        );
      }

      router.refresh();
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Connector sync failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connector-sync-control">
      <button type="button" onClick={sync} disabled={busy}>
        <RefreshCw size={13} className={busy ? "spin" : ""} />
        {busy ? "Syncing..." : label}
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
