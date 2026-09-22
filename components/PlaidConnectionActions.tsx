"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldAlert, Unplug } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from "react-plaid-link";

export default function PlaidConnectionActions({
  connectionId,
  configured,
  status,
}: {
  connectionId: string;
  configured: boolean;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "repair" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateToken, setUpdateToken] = useState<string | null>(null);
  const openedToken = useRef<string | null>(null);

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

  const onRepairSuccess: PlaidLinkOnSuccess = async () => {
    setUpdateToken(null);
    openedToken.current = null;
    setBusy("sync");
    setError(null);

    const response = await fetch("/api/plaid/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      setError(body.error ?? body.results?.[0]?.error ?? "Repair completed but refresh failed.");
    } else {
      router.refresh();
    }
    setBusy(null);
  };

  const onRepairExit: PlaidLinkOnExit = (plaidError) => {
    setBusy(null);
    setUpdateToken(null);
    openedToken.current = null;
    if (plaidError) {
      setError(plaidError.display_message ?? plaidError.error_message ?? "Repair flow exited.");
    }
  };

  const { open, ready } = usePlaidLink({
    token: updateToken,
    onSuccess: onRepairSuccess,
    onExit: onRepairExit,
  });

  useEffect(() => {
    if (updateToken && ready && openedToken.current !== updateToken) {
      openedToken.current = updateToken;
      open();
    }
  }, [open, ready, updateToken]);

  async function repair() {
    setBusy("repair");
    setError(null);

    const response = await fetch("/api/plaid/update-link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error ?? "Unable to open Plaid repair mode.");
      setBusy(null);
      return;
    }

    setUpdateToken(body.link_token);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this Sandbox Item and remove its imported Plaid test data?")) {
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
      {status === "needs_update" ? (
        <button className="repair" type="button" disabled={!configured || busy !== null} onClick={repair}>
          <ShieldAlert size={13} />
          Repair
        </button>
      ) : (
        <button type="button" disabled={!configured || busy !== null} onClick={sync}>
          <RefreshCw size={13} className={busy === "sync" ? "spin" : ""} />
          Sync
        </button>
      )}
      <button className="danger" type="button" disabled={!configured || busy !== null} onClick={disconnect}>
        <Unplug size={13} />
        Disconnect
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
