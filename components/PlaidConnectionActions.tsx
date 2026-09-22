"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Unplug } from "lucide-react";

export default function PlaidConnectionActions({
  connectionId,
  configured,
}: {
  connectionId: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy("sync");
    setError(null);
    const response = await fetch("/api/plaid/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      setError(body.error ?? body.results?.[0]?.error ?? "Sync failed.");
    } else {
      router.refresh();
    }
    setBusy(null);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this Sandbox Item and remove its imported Plaid data?")) {
      return;
    }

    setBusy("disconnect");
    setError(null);
    const response = await fetch("/api/plaid/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Disconnect failed.");
    } else {
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <div className="plaid-row-actions">
      <button type="button" disabled={!configured || busy !== null} onClick={sync}>
        <RefreshCw size={13} className={busy === "sync" ? "spin" : ""} />
        Sync
      </button>
      <button className="danger" type="button" disabled={!configured || busy !== null} onClick={disconnect}>
        <Unplug size={13} />
        Disconnect
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
