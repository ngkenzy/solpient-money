"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark,
  LoaderCircle,
  TestTube2,
  WalletCards,
} from "lucide-react";
import {
  usePlaidLink,
  type PlaidLinkOnExit,
  type PlaidLinkOnSuccess,
} from "react-plaid-link";

type Mode = "banking" | "investments";

export default function PlaidConnectButton({
  mode,
  configured,
}: {
  mode: Mode;
  configured: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const openedToken = useRef<string | null>(null);

  const onSuccess: PlaidLinkOnSuccess = async (publicToken, metadata) => {
    if (!publicToken) {
      setBusy(false);
      setMessage("Plaid Link completed without an Item token.");
      return;
    }

    setMessage("Connecting and importing Sandbox data...");

    const response = await fetch("/api/plaid/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicToken,
        mode,
        institution: metadata.institution,
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.error ?? "Plaid connection failed.");
      setBusy(false);
      return;
    }

    setMessage("Connected. Money data refreshed.");
    setBusy(false);
    setToken(null);
    openedToken.current = null;
    router.refresh();
  };

  const onExit: PlaidLinkOnExit = (error) => {
    setBusy(false);
    setToken(null);
    openedToken.current = null;
    if (error) setMessage(error.display_message ?? error.error_message ?? "Plaid Link exited.");
  };

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (token && ready && openedToken.current !== token) {
      openedToken.current = token;
      open();
    }
  }, [open, ready, token]);

  async function startLink() {
    if (!configured) return;
    setBusy(true);
    setMessage("Creating secure Plaid Link session...");

    const response = await fetch("/api/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.error ?? "Unable to start Plaid Link.");
      setBusy(false);
      return;
    }

    setToken(body.link_token);
    setMessage("Plaid Link ready.");
  }

  async function createSandboxItem() {
    if (!configured) return;
    setBusy(true);
    setMessage("Creating First Platypus Bank test Item...");

    const response = await fetch("/api/plaid/sandbox-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.error ?? "Sandbox test Item failed.");
      setBusy(false);
      return;
    }

    setMessage("Sandbox Item created and synced.");
    setBusy(false);
    router.refresh();
  }

  const Icon = mode === "investments" ? WalletCards : Landmark;

  return (
    <div className="plaid-connect-block">
      <div className="plaid-connect-title">
        <span><Icon size={18} /></span>
        <div>
          <strong>{mode === "investments" ? "Investment account" : "Bank / credit account"}</strong>
          <small>
            {mode === "investments"
              ? "Initializes Plaid Investments and imports holdings."
              : "Initializes Transactions with Liabilities as an optional enhancement."}
          </small>
        </div>
      </div>

      <div className="plaid-connect-actions">
        <button
          className="plaid-primary"
          type="button"
          disabled={!configured || busy}
          onClick={startLink}
        >
          {busy ? <LoaderCircle size={14} className="spin" /> : <Icon size={14} />}
          Open Plaid Link
        </button>
        <button
          className="plaid-secondary"
          type="button"
          disabled={!configured || busy}
          onClick={createSandboxItem}
        >
          <TestTube2 size={14} />
          Create test Item
        </button>
      </div>

      {message ? <p className="plaid-action-message">{message}</p> : null}
    </div>
  );
}
