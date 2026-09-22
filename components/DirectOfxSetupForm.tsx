"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  FlaskConical,
  LockKeyhole,
  PlugZap,
  ServerCog,
} from "lucide-react";
import {
  directOfxInstitutionProfiles,
  type DirectOfxInstitutionProfile,
} from "@/lib/connect/direct-ofx/institutions";

type MessageSet = "banking" | "credit_card" | "investment";
type AuthMode = "app_password" | "userkey";

type ProbeState = {
  busy?: boolean;
  ok?: boolean;
  message?: string;
  detail?: string;
};

export default function DirectOfxSetupForm({
  configured,
}: {
  configured: boolean;
}) {
  const router = useRouter();
  const [messageSet, setMessageSet] =
    useState<MessageSet>("banking");
  const [authMode, setAuthMode] =
    useState<AuthMode>("app_password");
  const [institutionName, setInstitutionName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [org, setOrg] = useState("");
  const [fid, setFid] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [appId, setAppId] = useState("SOLPIENT");
  const [appVer, setAppVer] = useState("0100");
  const [selectedProfile, setSelectedProfile] =
    useState<string | null>(null);
  const [probeStates, setProbeStates] = useState<
    Record<string, ProbeState>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function applyProfile(profile: DirectOfxInstitutionProfile) {
    if (
      profile.status !== "candidate" ||
      !profile.endpointUrl ||
      !profile.messageSet
    ) {
      return;
    }

    setSelectedProfile(profile.id);
    setInstitutionName(profile.name);
    setEndpointUrl(profile.endpointUrl);
    setOrg(profile.org ?? "");
    setFid(profile.fid ?? "");
    setBrokerId(profile.brokerId ?? "");
    setAppId(profile.appId);
    setAppVer(profile.appVer);
    setMessageSet(profile.messageSet);
    setError(null);
    setResult(
      `${profile.name} candidate settings loaded. Run the anonymous probe before adding credentials.`
    );
  }

  async function probe(profile: DirectOfxInstitutionProfile) {
    setProbeStates((current) => ({
      ...current,
      [profile.id]: { busy: true },
    }));

    try {
      const response = await fetch("/api/connect/ofx/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Anonymous OFX profile probe failed."
        );
      }

      const probeResult = body.probe;
      const supported = [
        probeResult.supportsInvestment ? "investment" : null,
        probeResult.supportsBanking ? "banking" : null,
        probeResult.supportsCreditCard ? "credit card" : null,
      ].filter(Boolean);

      setProbeStates((current) => ({
        ...current,
        [profile.id]: {
          busy: false,
          ok: Boolean(body.ok),
          message: body.ok
            ? "OFX profile accepted"
            : `Server reached · OFX ${probeResult.code ?? "response rejected"}`,
          detail: [
            probeResult.financialInstitutionName,
            supported.length
              ? `Supports ${supported.join(", ")}`
              : null,
            probeResult.message,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      }));
    } catch (probeError) {
      setProbeStates((current) => ({
        ...current,
        [profile.id]: {
          busy: false,
          ok: false,
          message: "Probe failed",
          detail:
            probeError instanceof Error
              ? probeError.message
              : "Unable to reach the OFX profile endpoint.",
        },
      }));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      institutionName,
      endpointUrl,
      org,
      fid,
      messageSet,
      accountType: form.get("accountType"),
      appId,
      appVer,
      authMode,
      userId: form.get("userId"),
      credential: form.get("credential"),
      accountId: form.get("accountId"),
      bankId: form.get("bankId"),
      brokerId,
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
          created.error ??
            "Unable to create Direct OFX connection."
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
        setResult(
          "Direct OFX connection saved and synchronized."
        );
        event.currentTarget.reset();
        setSelectedProfile(null);
        setInstitutionName("");
        setEndpointUrl("");
        setOrg("");
        setFid("");
        setBrokerId("");
        setAppId("SOLPIENT");
        setAppVer("0100");
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
    <>
      <section className="card page-card direct-ofx-known">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              INSTITUTION CAPABILITY REGISTRY
            </span>
            <h2>Start with what we already know.</h2>
          </div>
          <span className="small-muted">
            No credentials used for probes
          </span>
        </div>

        <div className="direct-ofx-known-grid">
          {directOfxInstitutionProfiles.map((profile) => {
            const probeState = probeStates[profile.id];
            const candidate = profile.status === "candidate";

            return (
              <article
                className={
                  "direct-ofx-known-card " + profile.status
                }
                key={profile.id}
              >
                <div className="direct-ofx-known-head">
                  <span
                    className={
                      "connector-sdk-icon " +
                      (candidate ? "" : "muted")
                    }
                  >
                    {candidate ? (
                      <ServerCog size={18} />
                    ) : (
                      <CircleOff size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{profile.name}</strong>
                    <span
                      className={
                        "connection-status " +
                        (candidate ? "stale" : "unavailable")
                      }
                    >
                      {candidate
                        ? "candidate"
                        : "direct OFX unavailable"}
                    </span>
                  </div>
                </div>

                <p>{profile.summary}</p>

                {candidate ? (
                  <div className="direct-ofx-known-facts">
                    <span>
                      Endpoint{" "}
                      <strong>
                        {new URL(
                          profile.endpointUrl!
                        ).hostname}
                      </strong>
                    </span>
                    <span>
                      FID <strong>{profile.fid ?? "—"}</strong>
                    </span>
                    <span>
                      Type{" "}
                      <strong>
                        {profile.messageSet ?? "—"}
                      </strong>
                    </span>
                  </div>
                ) : null}

                <div className="direct-ofx-known-actions">
                  {candidate ? (
                    <>
                      <button
                        type="button"
                        onClick={() => applyProfile(profile)}
                      >
                        <PlugZap size={13} />
                        {selectedProfile === profile.id
                          ? "Profile loaded"
                          : "Use profile"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void probe(profile)}
                        disabled={probeState?.busy}
                      >
                        <FlaskConical
                          size={13}
                          className={
                            probeState?.busy ? "spin" : ""
                          }
                        />
                        {probeState?.busy
                          ? "Probing..."
                          : "Probe anonymously"}
                      </button>
                    </>
                  ) : (
                    <span>
                      Use Files now · OAuth/FDX later
                    </span>
                  )}
                </div>

                {probeState?.message ? (
                  <div
                    className={
                      "direct-ofx-probe-result " +
                      (probeState.ok ? "ok" : "attention")
                    }
                  >
                    <strong>{probeState.message}</strong>
                    {probeState.detail ? (
                      <span>{probeState.detail}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="direct-ofx-evidence">
                  {profile.evidence.map((source) => (
                    <a
                      href={source.url}
                      key={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.label}
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card page-card direct-ofx-setup">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              DIRECT CONNECT SETUP
            </span>
            <h2>Add or refine an institution OFX endpoint</h2>
          </div>
          <span
            className={
              "live-pill " +
              (configured ? "connected" : "disconnected")
            }
          >
            {configured
              ? "SECRET VAULT READY"
              : "ENCRYPTION KEY NEEDED"}
          </span>
        </div>

        {!configured ? (
          <div className="connect-error">
            <LockKeyhole size={17} />
            <span>
              Set <code>CONNECT_SECRET_ENCRYPTION_KEY</code>{" "}
              in <code>.env.local</code> before saving Direct OFX
              credentials.
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
                value={institutionName}
                onChange={(event) =>
                  setInstitutionName(event.target.value)
                }
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
                value={endpointUrl}
                onChange={(event) =>
                  setEndpointUrl(event.target.value)
                }
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
                  setMessageSet(
                    event.target.value as MessageSet
                  )
                }
              >
                <option value="banking">Banking</option>
                <option value="credit_card">
                  Credit card
                </option>
                <option value="investment">
                  Investment
                </option>
              </select>
            </label>

            {messageSet === "banking" ? (
              <label>
                <span>Account type</span>
                <select
                  name="accountType"
                  defaultValue="CHECKING"
                >
                  <option value="CHECKING">Checking</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="MONEYMRKT">
                    Money market
                  </option>
                  <option value="CREDITLINE">
                    Credit line
                  </option>
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
                  setAuthMode(
                    event.target.value as AuthMode
                  )
                }
              >
                <option value="app_password">
                  Direct Connect / app credential
                </option>
                <option value="userkey">
                  OFX USERKEY
                </option>
              </select>
            </label>
          </div>

          <div className="direct-ofx-grid two">
            <label>
              <span>ORG</span>
              <input
                name="org"
                value={org}
                onChange={(event) => setOrg(event.target.value)}
                placeholder="Optional, must pair with FID"
                autoComplete="off"
              />
            </label>
            <label>
              <span>FID</span>
              <input
                name="fid"
                value={fid}
                onChange={(event) => setFid(event.target.value)}
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
                  value={brokerId}
                  onChange={(event) =>
                    setBrokerId(event.target.value)
                  }
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
                value={appId}
                onChange={(event) =>
                  setAppId(event.target.value)
                }
                autoComplete="off"
              />
            </label>
            <label>
              <span>APPVER</span>
              <input
                name="appVer"
                value={appVer}
                onChange={(event) =>
                  setAppVer(event.target.value)
                }
                autoComplete="off"
              />
            </label>
          </div>

          {selectedProfile === "vanguard" ? (
            <div className="direct-ofx-profile-note">
              <AlertTriangle size={15} />
              <span>
                Vanguard settings are a candidate profile from current
                Quicken availability plus community-observed OFX
                configuration. Solpient keeps APPID=SOLPIENT and does
                not impersonate Quicken.
              </span>
            </div>
          ) : null}

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
                <strong>Direct OFX</strong>
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
              {busy
                ? "Saving + testing..."
                : "Save + test connection"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
