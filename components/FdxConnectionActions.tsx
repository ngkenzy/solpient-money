"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  RotateCcw,
  Unplug,
} from "lucide-react";

export default function FdxConnectionActions({
  connectionId,
  providerId,
  canReconnect,
}: {
  connectionId: string;
  providerId: string;
  canReconnect: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<
    "sync" | "disconnect" | null
  >(null);
  const [error, setError] =
    useState<string | null>(null);

  async function sync() {
    setBusy("sync");
    setError(null);
    try {
      const response = await fetch(
        "/api/connect/sync",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            connectorId: "fdx",
            instanceId: connectionId,
          }),
        }
      );
      const body = await response.json();
      if (!response.ok || body.ok === false) {
        throw new Error(
          body.results?.[0]?.error ??
            body.error ??
            "FDX sync failed."
        );
      }
      router.refresh();
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "FDX sync failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Disconnect this OAuth/FDX connection and remove its imported FDX data?"
      )
    ) {
      return;
    }

    setBusy("disconnect");
    setError(null);
    try {
      const response = await fetch(
        "/api/connect/disconnect",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            connectorId: "fdx",
            instanceId: connectionId,
          }),
        }
      );
      const body = await response.json();
      if (!response.ok || body.ok === false) {
        throw new Error(
          body.error ??
            "Unable to disconnect OAuth/FDX."
        );
      }
      router.refresh();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Unable to disconnect OAuth/FDX."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fdx-connection-actions">
      <div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy !== null}
        >
          <RefreshCw
            size={13}
            className={
              busy === "sync" ? "spin" : ""
            }
          />
          {busy === "sync"
            ? "Syncing..."
            : "Sync"}
        </button>

        {canReconnect ? (
          <a
            href={`/api/connect/fdx/start?provider=${encodeURIComponent(
              providerId
            )}`}
          >
            <RotateCcw size={13} />
            Reconnect
          </a>
        ) : null}

        <button
          className="danger"
          type="button"
          onClick={() =>
            void disconnect()
          }
          disabled={busy !== null}
        >
          <Unplug size={13} />
          Disconnect
        </button>
      </div>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
