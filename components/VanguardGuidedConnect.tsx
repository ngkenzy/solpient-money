"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Landmark,
  LockKeyhole,
  PlugZap,
  RotateCcw,
} from "lucide-react";

type Step = "probe" | "credentials" | "done";

type ProbeOutcome = {
  attempted: boolean;
  busy: boolean;
  ok: boolean;
  message: string;
  detail: string;
};

type SyncOutcome = {
  ok: boolean;
  holdings: number;
  transactions: number;
  message: string;
} | null;

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "probe", label: "Check Vanguard" },
  { id: "credentials", label: "Sign in" },
  { id: "done", label: "Sync" },
];

export default function VanguardGuidedConnect({
  configured,
}: {
  configured: boolean;
}) {
  const [step, setStep] = useState<Step>("probe");
  const [probe, setProbe] = useState<ProbeOutcome>({
    attempted: false,
    busy: false,
    ok: false,
    message: "",
    detail: "",
  });
  const [userId, setUserId] = useState("");
  const [credential, setCredential] = useState("");
  const [accountId, setAccountId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SyncOutcome>(null);

  async function runProbe() {
    setProbe((current) => ({
      ...current,
      busy: true,
      message: "",
      detail: "",
    }));
    try {
      const response = await fetch("/api/connect/ofx/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "vanguard" }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error ?? "Vanguard did not answer the anonymous check."
        );
      }
      const result = body.probe ?? {};
      const supported = [
        result.supportsInvestment ? "investment" : null,
        result.supportsBanking ? "banking" : null,
        result.supportsCreditCard ? "credit card" : null,
      ].filter(Boolean);
      setProbe({
        attempted: true,
        busy: false,
        ok: Boolean(body.ok),
        message: body.ok
          ? "Vanguard answered — Direct Connect looks available."
          : "Vanguard's server was reached, but did not accept the OFX profile.",
        detail: [
          result.financialInstitutionName,
          supported.length
            ? `Supports ${supported.join(", ")}`
            : null,
          result.message,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (probeError) {
      setProbe({
        attempted: true,
        busy: false,
        ok: false,
        message: "Could not reach Vanguard's OFX server.",
        detail:
          probeError instanceof Error
            ? probeError.message
            : "The anonymous check failed.",
      });
    }
  }

  async function submitCredentials() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const createResponse = await fetch(
        "/api/connect/ofx/connections",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: "vanguard",
            authMode: "app_password",
            userId: userId.trim(),
            credential,
            accountId: accountId.trim(),
            credentialIsDedicated: true,
          }),
        }
      );
      const created = await createResponse.json();
      if (!createResponse.ok) {
        throw new Error(
          created.error ?? "Unable to save the Vanguard connection."
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
      const first = sync.results?.[0];

      if (!syncResponse.ok || sync.ok === false || first?.ok === false) {
        throw new Error(
          first?.error ??
            sync.error ??
            "Vanguard connection saved, but the first sync failed."
        );
      }

      setOutcome({
        ok: true,
        holdings: Number(first?.holdingCount ?? 0),
        transactions: Number(first?.transactionCount ?? 0),
        message: "Vanguard connected and synchronized.",
      });
      setStep("done");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to connect Vanguard."
      );
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("probe");
    setProbe({
      attempted: false,
      busy: false,
      ok: false,
      message: "",
      detail: "",
    });
    setUserId("");
    setCredential("");
    setAccountId("");
    setConfirmed(false);
    setError(null);
    setOutcome(null);
  }

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  return (
    <section className="card page-card vanguard-guided">
      <div className="section-title-row">
        <div>
          <span className="card-kicker">GUIDED SETUP · RECOMMENDED</span>
          <h2>Connect Vanguard in three steps</h2>
        </div>
        <span className="connector-sdk-icon">
          <Landmark size={18} />
        </span>
      </div>

      <p className="vanguard-guided-lede">
        Everything technical — server address, institution identifiers, app
        identity — is filled in for you. You only enter your Vanguard sign-in
        and account number.
      </p>

      <ol className="vanguard-guided-steps">
        {STEPS.map((entry, index) => (
          <li
            key={entry.id}
            className={
              "vanguard-guided-step " +
              (index < stepIndex ? "done" : "") +
              (index === stepIndex ? " active" : "")
            }
          >
            <span className="vanguard-guided-step-num">
              {index < stepIndex ? "✓" : index + 1}
            </span>
            <span>{entry.label}</span>
          </li>
        ))}
      </ol>

      {!configured ? (
        <div className="connect-error">
          <LockKeyhole size={17} />
          <span>
            Set <code>CONNECT_SECRET_ENCRYPTION_KEY</code> in{" "}
            <code>.env.local</code> and restart the dev server before
            connecting Vanguard. Credentials are encrypted with this key
            before they touch the database.
          </span>
        </div>
      ) : null}

      {step === "probe" && configured ? (
        <div className="vanguard-guided-body">
          <div className="vanguard-guided-note">
            <FlaskConical size={17} />
            <div>
              <strong>Step 1 — knock on Vanguard&apos;s door.</strong>
              <span>
                Solpient sends an anonymous profile request to
                Vanguard&apos;s OFX server. No credentials, no account data —
                just checking that Direct Connect answers.
              </span>
            </div>
          </div>

          {probe.message ? (
            <div
              className={
                "vanguard-guided-probe " + (probe.ok ? "ok" : "attention")
              }
            >
              <strong>{probe.message}</strong>
              {probe.detail ? <span>{probe.detail}</span> : null}
            </div>
          ) : null}

          {probe.attempted && !probe.ok ? (
            <div className="vanguard-guided-note warning">
              <AlertTriangle size={17} />
              <div>
                <strong>Vanguard didn&apos;t answer cleanly.</strong>
                <span>
                  You can still try signing in — the full sign-in sometimes
                  works when the anonymous check doesn&apos;t. If it fails,
                  CSV import on the Connect page remains the reliable
                  fallback.
                </span>
              </div>
            </div>
          ) : null}

          <div className="connect-actions">
            <button
              className="data-submit"
              type="button"
              onClick={() => void runProbe()}
              disabled={probe.busy}
            >
              <FlaskConical size={14} />
              {probe.busy
                ? "Checking..."
                : probe.attempted
                  ? "Check again"
                  : "Run the anonymous check"}
            </button>
            {probe.attempted ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("credentials");
                }}
              >
                Continue to sign-in <ArrowRight size={14} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "credentials" && configured ? (
        <div className="vanguard-guided-body">
          <div className="vanguard-guided-note">
            <PlugZap size={17} />
            <div>
              <strong>Step 2 — sign in to Vanguard.</strong>
              <span>
                Vanguard Direct Connect usually accepts the same username and
                password you use on vanguard.com. If sign-in is rejected,
                check your Vanguard security settings for a third-party
                access or app-password option.
              </span>
            </div>
          </div>

          <div className="direct-ofx-grid two vanguard-guided-form">
            <label>
              <span>Vanguard username *</span>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                autoComplete="off"
                placeholder="Your Vanguard username"
              />
            </label>
            <label>
              <span>Vanguard password *</span>
              <input
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Your Vanguard password"
              />
            </label>
          </div>

          <div className="direct-ofx-grid vanguard-guided-form">
            <label>
              <span>Vanguard account number *</span>
              <input
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                autoComplete="off"
                placeholder="e.g. 12345678"
              />
              <small className="small-muted">
                Find it on a Vanguard statement or under My Accounts on
                vanguard.com. One connection syncs one account — repeat these
                steps for each Vanguard account you hold.
              </small>
            </label>
          </div>

          <label className="connect-remember direct-ofx-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I understand my Vanguard credentials are encrypted and stored
              only on this Mac, and used only to download my Vanguard data.
            </span>
          </label>

          {error ? (
            <div className="connect-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="connect-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setStep("probe")}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="data-submit"
              type="button"
              disabled={
                busy ||
                !userId.trim() ||
                !credential ||
                !accountId.trim() ||
                !confirmed
              }
              onClick={() => void submitCredentials()}
            >
              <PlugZap size={14} />
              {busy ? "Connecting..." : "Connect + sync Vanguard"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="vanguard-guided-body">
          {outcome?.ok ? (
            <div className="connect-success">
              <CheckCircle2 size={18} />
              <div>
                <strong>{outcome.message}</strong>
                <span>
                  {outcome.holdings > 0
                    ? `${outcome.holdings} holding${outcome.holdings === 1 ? "" : "s"} synced.`
                    : ""}
                  {outcome.transactions > 0
                    ? ` ${outcome.transactions} transaction${outcome.transactions === 1 ? "" : "s"} from the last 90 days synced.`
                    : ""}
                  {outcome.holdings === 0 && outcome.transactions === 0
                    ? "The sync completed but returned no positions or activity for this account."
                    : ""}
                </span>
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
            <Link className="research-button" href="/portfolio">
              View Portfolio <ArrowRight size={14} />
            </Link>
            <button
              className="text-button"
              type="button"
              onClick={reset}
            >
              <RotateCcw size={14} /> Connect another Vanguard account
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
