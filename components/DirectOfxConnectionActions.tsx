"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Unplug, X } from "lucide-react";
import {
  ImportActionAlert,
  ImportActionConfirm,
} from "./ImportActionConfirm";

export default function DirectOfxConnectionActions({
  connectionId,
  configured,
}: {
  connectionId: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<
    "sync" | "repair" | "disconnect" | null
  >(null);
  const [showRepair, setShowRepair] = useState(false);
  const [disconnectArmed, setDisconnectArmed] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy("sync");
    setError(null);
    try {
      const response = await fetch("/api/connect/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: "ofx-direct",
          instanceId: connectionId,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) {
        throw new Error(
          body.results?.[0]?.error ??
            body.error ??
            "Direct OFX sync failed."
        );
      }
      router.refresh();
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Direct OFX sync failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function repair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("repair");
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(
        "/api/connect/ofx/connections",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId,
            authMode: form.get("authMode"),
            userId: form.get("userId"),
            credential: form.get("credential"),
            clientUid: form.get("clientUid"),
            authToken: form.get("authToken"),
            credentialIsDedicated:
              form.get("credentialIsDedicated") === "on",
          }),
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error ?? "Unable to update Direct OFX credential."
        );
      }

      setShowRepair(false);
      await sync();
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : "Unable to update Direct OFX credential."
      );
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);

    try {
      const response = await fetch("/api/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: "ofx-direct",
          instanceId: connectionId,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) {
        throw new Error(
          body.error ?? "Unable to disconnect Direct OFX."
        );
      }
      setDisconnectArmed(false);
      router.refresh();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Unable to disconnect Direct OFX."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="direct-ofx-actions">
      <div className="direct-ofx-action-row">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={!configured || busy !== null}
        >
          <RefreshCw
            size={13}
            className={busy === "sync" ? "spin" : ""}
          />
          Sync
        </button>
        <button
          type="button"
          onClick={() => setShowRepair((value) => !value)}
          disabled={!configured || busy !== null}
        >
          {showRepair ? <X size={13} /> : <KeyRound size={13} />}
          {showRepair ? "Close" : "Credential"}
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => {
            setError(null);
            setDisconnectArmed(true);
          }}
          disabled={!configured || busy !== null}
        >
          <Unplug size={13} />
          Disconnect
        </button>
      </div>

      {disconnectArmed ? (
        <ImportActionConfirm
          title="Disconnect Direct OFX?"
          detail="Disconnect this Direct OFX connection and remove its imported OFX data? This cannot be undone."
          confirmLabel="Confirm disconnect"
          busyLabel="Disconnecting…"
          busy={busy !== null}
          onConfirm={() => void disconnect()}
          onCancel={() => setDisconnectArmed(false)}
        />
      ) : null}

      {showRepair ? (
        <form className="direct-ofx-repair" onSubmit={repair}>
          <select name="authMode" defaultValue="app_password">
            <option value="app_password">
              Direct Connect/app credential
            </option>
            <option value="userkey">OFX USERKEY</option>
          </select>
          <input
            name="userId"
            placeholder="New user ID (optional)"
            autoComplete="off"
          />
          <input
            name="credential"
            type="password"
            placeholder="New credential / USERKEY (optional)"
            autoComplete="new-password"
          />
          <input
            name="clientUid"
            placeholder="CLIENTUID (optional)"
            autoComplete="off"
          />
          <input
            name="authToken"
            type="password"
            placeholder="One-time AUTHTOKEN (optional)"
            autoComplete="new-password"
          />
          <label>
            <input
              name="credentialIsDedicated"
              type="checkbox"
              required
            />
            <span>
              Direct Connect/app credential only—not my normal bank password.
            </span>
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === "repair"
              ? "Updating..."
              : "Update + retry"}
          </button>
        </form>
      ) : null}

      {error ? (
        <ImportActionAlert message={error} />
      ) : null}
    </div>
  );
}
