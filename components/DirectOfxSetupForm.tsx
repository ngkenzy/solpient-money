"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  PlugZap,
} from "lucide-react";

type MessageSet = "banking" | "credit_card" | "investment";
type AuthMode = "app_password" | "userkey";

export default function DirectOfxSetupForm({
  configured,
}: {
  configured: boolean;
}) {
  const router = useRouter();
  const [messageSet, setMessageSet] = useState<MessageSet>("banking");
  const [authMode, setAuthMode] = useState<AuthMode>("app_password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      institutionName: form.get("institutionName"),
      endpointUrl: form.get("endpointUrl"),
      org: form.get("org"),
      fid: form.get("fid"),
      messageSet,
      accountType: form.get("accountType"),
      appId: form.get("appId"),
      appVer: form.get("appVer"),
      authMode,
      userId: form.get("userId"),
      credential: form.get("credential"),
      accountId: form.get("accountId"),
      bankId: form.get("bankId"),
      brokerId: form.get("brokerId"),
      clientUid: form.get("clientUid"),
      authToken: form.get("authToken"),
      credentialIsDedicated:
        form.get("credentialIsDedicated") === "on",
    };

    try {
      const createResponse = await fetch(
        "/api/connect/ofx/connections",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const created = await createResponse.json();
      if (!createResponse.ok) {
        throw new Error(
          created.error ?? "Unable to create Direct OFX connection."
        );
      }

      const syncResponse = await fetch("/api/connect/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: "ofx-direct",
          instanceId: created.connectionId,
        }),
      });
      const sync = await syncResponse.json();

      if (!syncResponse.ok || sync.ok === false) {
        const syncError =
          sync.results?.[0]?.error ??
          sync.error ??
          "Connection saved, but the first OFX sync failed.";
        setResult(
          "Connection saved. Review the sync error below and update the institution settings or credential."
        );
        setError(syncError);
      } else {
        setResult("Direct OFX connection saved and synchronized.");
        event.currentTarget.reset();
        setMessageSet("banking");
        setAuthMode("app_password");
      }

      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save Direct OFX connection."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card page-card direct-ofx-setup">
      <div className="section-title-row">
        <div>
          <span className="card-kicker">DIRECT CONNECT SETUP</span>
          <h2>Add an institution OFX endpoint</h2>
        </div>
        <span
          className={
            "live-pill " + (configured ? "connected" : "disconnected")
          }
        >
          {configured ? "SECRET VAULT READY" : "ENCRYPTION KEY NEEDED"}
        </span>
      </div>

      {!configured ? (
        <div className="connect-error">
          <LockKeyhole size={17} />
          <span>
            Set <code>CONNECT_SECRET_ENCRYPTION_KEY</code> in{" "}
            <code>.env.local</code> before saving Direct OFX credentials.
          </span>
        </div>
      ) : null}

      <div className="direct-ofx-safety">
        <AlertTriangle size={17} />
        <div>
          <strong>Use Direct Connect credentials only.</strong>
          <span>
            Do not enter your normal online-banking password. Use an
            institution-issued app password, Direct Connect credential,
            USERKEY, or one-time authorization token.
          </span>
        </div>
      </div>

      <form className="direct-ofx-form" onSubmit={submit}>
        <div className="direct-ofx-grid two">
          <label>
            <span>Institution name *</span>
            <input
              name="institutionName"
              required
              placeholder="Example Bank"
              autoComplete="off"
            />
          </label>
          <label>
            <span>HTTPS OFX endpoint *</span>
            <input
              name="endpointUrl"
              type="url"
              required
              placeholder="https://ofx.examplebank.com/ofx"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="direct-ofx-grid three">
          <label>
            <span>Message set</span>
            <select
              value={messageSet}
              onChange={(event) =>
                setMessageSet(event.target.value as MessageSet)
              }
            >
              <option value="banking">Banking</option>
              <option value="credit_card">Credit card</option>
              <option value="investment">Investment</option>
            </select>
          </label>

          {messageSet === "banking" ? (
            <label>
              <span>Account type</span>
              <select name="accountType" defaultValue="CHECKING">
                <option value="CHECKING">Checking</option>
                <option value="SAVINGS">Savings</option>
                <option value="MONEYMRKT">Money market</option>
                <option value="CREDITLINE">Credit line</option>
                <option value="CD">CD</option>
              </select>
            </label>
          ) : (
            <div />
          )}

          <label>
            <span>Authentication</span>
            <select
              value={authMode}
              onChange={(event) =>
                setAuthMode(event.target.value as AuthMode)
              }
            >
              <option value="app_password">
                Direct Connect / app credential
              </option>
              <option value="userkey">OFX USERKEY</option>
            </select>
          </label>
        </div>

        <div className="direct-ofx-grid two">
          <label>
            <span>ORG</span>
            <input
              name="org"
              placeholder="Optional, must pair with FID"
              autoComplete="off"
            />
          </label>
          <label>
            <span>FID</span>
            <input
              name="fid"
              placeholder="Optional, must pair with ORG"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="direct-ofx-grid two">
          {messageSet === "investment" ? (
            <label>
              <span>BROKERID *</span>
              <input
                name="brokerId"
                required
                placeholder="Institution-provided broker ID"
                autoComplete="off"
              />
            </label>
          ) : messageSet === "banking" ? (
            <label>
              <span>BANKID / routing identifier *</span>
              <input
                name="bankId"
                required
                placeholder="Institution-provided BANKID"
                autoComplete="off"
              />
            </label>
          ) : (
            <div />
          )}

          <label>
            <span>Account ID *</span>
            <input
              name="accountId"
              required
              placeholder="Direct Connect account identifier"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="direct-ofx-grid two">
          <label>
            <span>OFX user ID *</span>
            <input
              name="userId"
              required
              autoComplete="off"
              placeholder="Direct Connect user ID"
            />
          </label>
          <label>
            <span>
              {authMode === "userkey"
                ? "OFX USERKEY *"
                : "Direct Connect credential *"}
            </span>
            <input
              name="credential"
              type="password"
              required
              autoComplete="new-password"
              placeholder={
                authMode === "userkey"
                  ? "Institution-issued USERKEY"
                  : "Institution-issued app credential"
              }
            />
          </label>
        </div>

        <div className="direct-ofx-grid two">
          <label>
            <span>CLIENTUID</span>
            <input
              name="clientUid"
              placeholder="Only if required by the institution"
              autoComplete="off"
            />
          </label>
          <label>
            <span>One-time AUTHTOKEN</span>
            <input
              name="authToken"
              type="password"
              placeholder="Optional first-session token"
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className="direct-ofx-grid two compact">
          <label>
            <span>APPID</span>
            <input
              name="appId"
              defaultValue="SOLPIENT"
              autoComplete="off"
            />
          </label>
          <label>
            <span>APPVER</span>
            <input
              name="appVer"
              defaultValue="0100"
              autoComplete="off"
            />
          </label>
        </div>

        <label className="connect-remember direct-ofx-confirm">
          <input
            name="credentialIsDedicated"
            type="checkbox"
            required
          />
          <span>
            I confirm this is an institution-issued Direct Connect/app
            credential or token—not my normal online-banking password.
          </span>
        </label>

        {result ? (
          <div className="connect-success">
            <CheckCircle2 size={18} />
            <div>
              <strong>Direct OFX saved</strong>
              <span>{result}</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="connect-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="connect-actions">
          <button
            className="data-submit"
            type="submit"
            disabled={!configured || busy}
          >
            <PlugZap size={14} />
            {busy ? "Saving + testing..." : "Save + test connection"}
          </button>
        </div>
      </form>
    </section>
  );
}
