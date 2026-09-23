
# Solpient Money

## Solpient Local V1 — current architecture

**Current release: Solpient Money 0.8.0.** Money no longer requires hosted Supabase at runtime.

```text
Browser
   ↓
Next.js on this Mac
   ↓
server-only Solpient DB layer
   ↓
PostgreSQL 17 in Docker
   ↓
127.0.0.1:5432 only
```

Solpient Research remains a separate read-only online data source. Household Money data stays in the local PostgreSQL database unless a connector is explicitly used.

### Historical migration folder note

The repository still contains the original SQL history under `supabase/migrations/`. That directory name is historical only. Solpient Local does **not** start or depend on Supabase; `scripts/local-db-init.mjs` applies those SQL files directly to plain PostgreSQL 17 and records their checksums in `public.local_migrations`.

### First-time Mac setup

Prerequisite: a Docker-compatible runtime such as Docker Desktop, OrbStack, or Colima must be running.

```bash
cd ~/Documents/solpient-money
git pull
npm ci
npm run local:setup
npm run dev
```

`local:setup`:

- creates a random PostgreSQL password
- creates a dedicated connector encryption key
- creates a dedicated backup encryption key
- writes secrets only to gitignored local environment files
- binds PostgreSQL to `127.0.0.1:5432`
- starts PostgreSQL 17 in Docker
- applies the existing PostgreSQL schema migrations
- creates the single local Solpient identity

Open:

```text
http://localhost:3000
```

If no household exists yet, open `/setup` to create one and optionally load the synthetic demo data.

### One-time hosted Money → Mac migration

Only use this if you want to copy existing Money data from the old hosted PostgreSQL database.

Set the source PostgreSQL URL temporarily in your shell:

```bash
export SOLPIENT_SOURCE_DATABASE_URL='postgresql://...'
npm run local:migrate-from-hosted
unset SOLPIENT_SOURCE_DATABASE_URL
```

If the remote Money database contains more than one user, also set:

```bash
export SOLPIENT_SOURCE_USER_ID='...'
```

The migration remaps the selected user to the single local identity and copies household financial data while preserving IDs and provenance.

Encrypted cloud connector secrets are deliberately **not** copied. Plaid, Direct OFX, and OAuth/FDX connection metadata is marked `needs_update` so those connectors can be re-authorized locally rather than carrying ciphertext encrypted under an old key.

If the local database already has household data, the migration refuses to overwrite it. Use the explicit replacement mode only when intended:

```bash
npm run local:migrate-from-hosted -- --replace
```

### Encrypted local backups

Create a backup:

```bash
npm run local:backup
```

Backups are compressed, then encrypted with AES-256-GCM and stored under the gitignored `backups/` directory. The setup command creates `SOLPIENT_BACKUP_ENCRYPTION_KEY` locally.

Restore one:

```bash
npm run local:restore -- backups/solpient-money-<timestamp>.sql.gz.enc
```

Keep `.env.local` and at least one encrypted backup copy off the laptop. Without the backup encryption key, the encrypted backup cannot be restored.

### Cost

The local database path itself has no hosted database fee:

- PostgreSQL Docker image: $0
- local database storage: uses your Mac disk
- Next.js local runtime: $0
- native CSV/QFX/OFX imports: $0

External services such as Plaid production, paid market data, AI APIs, or future bank-provider onboarding can still have their own costs.

---


Solpient Money is the private household-finance side of the Solpient platform.

## V0.6.1 status

**Money database + auth: live.**  
**Plaid Sandbox architecture: live.**  
**V0.6.1 hardening: automatic page-open refresh, repair mode, and persistent test-data provenance.**

V0.6.1 keeps the V0.5 private household database and V0.6 Plaid connection layer, then makes Sandbox state and connection health explicit throughout Money.

## What V0.6 adds

### Plaid Sandbox Connections

New route:

```
/connections
```

Two explicit connection flows are supported:

- **Bank / credit** — initializes Plaid Transactions and requests Liabilities as an optional enhancement.
- **Investments** — initializes Plaid Investments directly and imports brokerage holdings.

V0.6 never connects to Plaid Production.

### Plaid Link

The web app uses `react-plaid-link@5.0.0`.

Flow:

```
Money user
   ↓
Create link_token
   ↓
Plaid Link
   ↓
public_token
   ↓
server exchange
   ↓
encrypted access_token
   ↓
initial sync
```

### Sandbox test Items

The Connections page also supports a one-click Sandbox test Item using First Platypus Bank. This bypasses the Link UI for repeatable testing while still exercising Solpient's token exchange, persistence, and sync code.

### Banking sync

V0.6 uses Plaid `/transactions/sync` with a persisted cursor.

Imported banking data includes:

- financial accounts
- current/available balances
- transaction history
- added transactions
- modified transactions
- removed transactions
- personal finance categories
- liability APR/minimum-payment enrichment when available

### Investment sync

V0.6 uses `/investments/holdings/get` to import:

- investment accounts
- securities
- ticker symbols when available
- quantity
- institution price
- institution value
- cost basis when available

Imported holdings continue to flow through Solpient Research matching.

### Token security

Plaid access tokens are **never stored in plaintext**.

The application:

1. Encrypts each access token with AES-256-GCM.
2. Stores only ciphertext, IV, and authentication tag.
3. Stores token ciphertext in `private.plaid_access_tokens`.
4. Exposes token storage/retrieval only through authenticated household-checked RPCs.
5. Keeps `PLAID_TOKEN_ENCRYPTION_KEY` outside GitHub and outside Supabase.

### Household isolation

Plaid connection metadata is stored in:

```
public.plaid_connections
```

It uses the same household RLS model as the rest of Solpient Money.

Anonymous users cannot read:

- Plaid connection metadata
- imported financial accounts
- imported transactions
- imported holdings
- encrypted Plaid token data

### V0.6.1 refresh, repair, and provenance

- Connected Sandbox Items refresh automatically every five minutes while the Connections page is open.
- A manual **Refresh now** action remains available.
- `ITEM_LOGIN_REQUIRED` and related re-authentication states surface as **Repair required**.
- **Repair** opens Plaid Link in update mode with the existing Item access token; the Item is synced again after successful repair.
- Invalid or missing Item tokens are clearly classified as reconnect-required failures.
- A persistent **PLAID SANDBOX · TEST DATA** badge remains visible across Money.
- Plaid-imported accounts, transactions, and holdings are individually labeled **PLAID TEST**.

### Refresh and disconnect

Each Sandbox Item can be manually refreshed from the Connections page.

Disconnect:

- calls Plaid `/item/remove`
- deletes Plaid-imported transactions
- deletes Plaid-imported holdings
- removes Plaid-imported accounts
- deletes the encrypted token
- removes the local connection record

Manual Money rows are preserved.

## Plaid configuration

Create a Plaid developer account and obtain Sandbox credentials from the Plaid Dashboard.

Copy `.env.example` to `.env.local`, then set:

```bash
PLAID_ENV=sandbox
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_TOKEN_ENCRYPTION_KEY=...
```

Generate the encryption key locally:

```bash
openssl rand -base64 32
```

Never commit `PLAID_SECRET` or `PLAID_TOKEN_ENCRYPTION_KEY`.

## Supabase migrations

V0.6 adds:

```
supabase/migrations/20260922070000_v06_plaid_sandbox.sql
supabase/migrations/20260922071500_v06_plaid_upsert_indexes.sql
```

Both are applied only to the dedicated **Solpient Money** project:

```
lvbkyxnptohcwqtuxxxh
```

Solpient Research remains a separate read-only source.

## Run locally

```bash
git clone https://github.com/ngkenzy/solpient-money.git
cd solpient-money
cp .env.example .env.local
# add your Plaid Sandbox secrets to .env.local
npm ci
npm run test:research
npm run test:money
npm run test:v04
npm run test:v05
npm run test:v06
npm run test:v061
npm run dev
```

Open:

```
http://localhost:3000
```

Then sign in and open **Connections**.

## Release sequence

1. V0.1 — dashboard shell + deterministic demo data ✅
2. V0.2 — navigation, portfolio, transactions, charts ✅
3. V0.3 — live Solpient Research integration ✅
4. V0.4 — financial intelligence + Scenario Lab ✅
5. V0.5 — auth + dedicated Money database + RLS + persistence ✅
6. V0.6 — Plaid Sandbox bank/brokerage connection layer ✅
7. V0.6.1 — Sandbox provenance, automatic page-open refresh, and Item repair ✅
8. V0.7 — personal Trial/Production test accounts
9. V1.0 — personal Solpient Money

## Security principles

- Never commit bank credentials.
- Never commit Plaid secrets.
- Never commit Supabase secret/service-role keys.
- Never store Plaid access tokens in plaintext.
- Personal financial data remains in the dedicated Money database.
- Solpient Research never receives household financial or authentication data.
- Plaid V0.6 is Sandbox-only.


## Solpient Connect V1

Solpient Money 0.6.2 adds a provider-independent ingestion layer at `/connect`.

- Native CSV transaction imports with flexible header detection.
- Native brokerage holdings CSV imports.
- QFX/OFX bank transaction parsing.
- QFX/OFX investment position parsing.
- Browser-side file parsing: the original statement file is not stored in Supabase.
- Server-side transaction fingerprints prevent duplicate file imports.
- Holding imports upsert positions by account + ticker.
- File import batches provide an authenticated household audit trail.
- Imported accounts, transactions, and holdings are labeled `FILE IMPORT`.
- Plaid Sandbox remains available as a separate adapter at `/connections`.
- FDX/OAuth and direct OFX adapters are reserved behind the same normalized Money model.

Verification:

```bash
npm run test:connect
npm run lint
npm run build
```


## Solpient Connect V1.1

Solpient Money 0.6.3 turns native file imports into a repeatable personal-finance workflow.

- Remembers successful CSV format signatures, column mappings, institution details, and preferred destination accounts.
- Lets users correct nonstandard CSV columns once and reuse that mapping next time.
- Reconciles projected activity against statement balances before import.
- Flags high duplicate ratios, reconciliation gaps, large balance jumps, future-dated rows, zero-value rows, and parser warnings.
- Tracks last file refresh per account and marks file sources stale after 14 days.
- Stores rollback metadata for every import batch.
- Supports one-click Undo for the latest import on an account and restores prior holdings/balance state.
- Prevents undoing an older batch before newer account imports are rolled back.
- Keeps the original statement file client-side; only normalized records and import metadata are persisted.
- New profile and audit fields remain household-isolated with RLS.

Verification:

```bash
npm run test:connect
npm run test:connect-v11
npm run lint
npm run build
```


## Solpient Connect V1.2 — Connector SDK

Solpient Money 0.6.4 introduces a provider-independent connector runtime.

Core contract:

```text
Connector manifest
  → capabilities
  → instances
  → health / freshness
  → normalized provenance
  → sync result
  → Solpient Money model
```

Registered adapters:

- **Files** — live native CSV/QFX/OFX ingestion.
- **Plaid** — live Sandbox aggregator adapter.
- **FDX / OAuth Direct** — reserved adapter slot.
- **Direct OFX** — reserved adapter slot.

The SDK standardizes:

- connector IDs and manifests
- accounts / transactions / holdings / liabilities capabilities
- manual-import vs automatic-sync capability
- reconciliation / repair / disconnect capability
- connection-instance health and freshness
- normalized provenance
- normalized account / transaction / holding / liability record contracts
- provider-independent sync results
- registry lookup and dispatch

The main `/connect` screen is now the unified connector surface. Plaid's dedicated `/connections` screen remains an adapter-detail page for Plaid Link, repair, disconnect, and Sandbox-specific controls.

Plaid automatic refresh and manual sync now execute through:

```text
POST /api/connect/sync
  connectorId=plaid
  instanceId=<optional>
```

The legacy `/api/plaid/sync` endpoint remains as a compatibility wrapper around the Connector SDK.

Verification:

```bash
npm run test:connect
npm run test:connect-v11
npm run test:connect-v12
npm run lint
npm run build
```


## Solpient Connect V1.3 — Direct OFX

Solpient Money 0.6.5 promotes Direct OFX from a reserved SDK slot to a live connector at `/connect/ofx`.

What it adds:

- Institution-configurable HTTPS OFX endpoints.
- Banking, credit-card, and investment request builders.
- OFX 1.x-compatible SGML request envelope for broad legacy server compatibility.
- Direct Connect/app-credential and OFX `USERKEY` authentication modes.
- Optional `CLIENTUID`, `AUTHTOKEN`, `ORG`, and `FID` fields for institutions that require them.
- One-time `AUTHTOKEN` removal from the encrypted secret after a successful sync.
- AES-256-GCM encryption using a dedicated `CONNECT_SECRET_ENCRYPTION_KEY`.
- Household-isolated public connection metadata plus private encrypted secret storage.
- Generic Connector SDK sync and disconnect.
- Banking transactions deduplicated/upserted by OFX FITID (with deterministic fallback).
- Investment positions replaced as a current snapshot.
- Direct OFX provenance on accounts, transactions, and holdings.
- `DIRECT OFX` labels throughout Money.
- OFX sign-on error parsing, including credential-update handling for code 15512.

Outbound-request safety:

- HTTPS only.
- Port 443 only.
- No credentials embedded in URLs.
- Rejects localhost, private, link-local, reserved, and multicast addresses.
- Resolves DNS before connecting and pins the request to the validated public address.
- TLS certificate validation is performed against the original institution hostname.
- Redirects are not followed.
- 20-second request timeout.
- 5 MB response-size ceiling.

Credential policy:

Solpient V1.3 does **not** ask users to store their normal online-banking password. The UI and API require explicit confirmation that the supplied secret is an institution-issued Direct Connect/app credential, `USERKEY`, or similar token.

Local configuration:

```bash
openssl rand -base64 32
```

Add the result to `.env.local`:

```bash
CONNECT_SECRET_ENCRYPTION_KEY=...
```

Then open:

```text
http://localhost:3000/connect/ofx
```

Verification:

```bash
npm run test:connect
npm run test:connect-v11
npm run test:connect-v12
npm run test:connect-v13
npm run lint
npm run build
```


## Solpient Connect V1.3.1 — Institution Profiles

Solpient Money 0.6.6 adds a curated Direct OFX institution capability registry and an anonymous profile probe.

Initial profiles:

- **Vanguard** — candidate Direct OFX investment profile.
- **Bank of America / Merrill** — marked unsupported for Direct OFX.
- **Chase** — marked unsupported for Direct OFX.

Vanguard candidate defaults:

```text
Endpoint: https://vesnc.vanguard.com/us/OfxDirectConnectServlet
FID:      1358
ORG:      Vanguard
BROKERID: vanguard.com
APPID:    SOLPIENT
APPVER:   0100
```

These are treated as candidate configuration, not a Vanguard-published public developer contract. Solpient deliberately does not impersonate Quicken by substituting `QWIN` or `QBW`.

Anonymous probe:

```text
POST /api/connect/ofx/probe
{ "profileId": "vanguard" }
```

The probe:

- requires an authenticated Solpient Money household
- only accepts curated profile IDs
- sends the OFX-standard anonymous profile request
- uses no account number, username, or password
- reports endpoint reachability, OFX sign-on status, FI name, advertised message sets, and advertised OFX URLs
- reuses the Direct OFX SSRF/TLS/timeout/response-size protections

The OFX specification permits the initial profile request to use the anonymous sign-on form. This lets Solpient distinguish endpoint/client compatibility problems before asking a user for any institution-issued Direct Connect secret.

Verification:

```bash
npm run test:connect-v13
npm run test:connect-v131
npm run lint
npm run build
```


## Solpient Connect V1.3.2 — Vanguard Profile/Sync Split

Solpient Money 0.6.7 fixes Vanguard OFX probing after a real local timeout exposed a protocol-profile mismatch.

Vanguard now has two candidate endpoints:

```text
Anonymous profile/bootstrap:
https://vesnc.vanguard.com/us/OfxProfileServlet

Investment transaction sync:
https://vesnc.vanguard.com/us/OfxDirectConnectServlet
```

Candidate identifiers:

```text
ORG:      The Vanguard Group
FID:      1358
BROKERID: vanguard.com
APPID:    SOLPIENT
APPVER:   0100
```

The anonymous `PROFRQ` probe now targets the profile/bootstrap servlet. Actual account synchronization continues to use the Direct Connect transaction servlet.

Network failures are also staged:

- `connect` — TCP connection did not complete.
- `tls` — TLS handshake did not complete.
- `response` — HTTPS/TLS succeeded but the OFX server did not answer in time.

The API returns the profile-probe stage and target host on failure. Solpient continues to use `APPID=SOLPIENT`; it does not impersonate Quicken.


## Solpient Connect V1.3.3 — Multi-address OFX failover

Solpient Money 0.6.8 hardens Direct OFX connectivity after the Vanguard profile servlet timed out during the TCP connect stage.

The Direct OFX client now:

- resolves every public IPv4/IPv6 address returned for the OFX hostname
- rejects the entire resolution set if any answer points at a private/reserved address
- de-duplicates addresses
- prefers IPv4 first, then IPv6
- attempts up to six validated public routes
- pins TLS validation to the original financial-institution hostname on every route
- uses stage-specific connect/TLS/response timeouts
- stops immediately when one validated route succeeds
- summarizes every failed route if none succeed

This removes DNS answer ordering as a source of false Direct OFX failures while retaining the V1.3 SSRF and TLS protections.

For Vanguard, V1.3.3 continues to use:

```text
Profile probe:
https://vesnc.vanguard.com/us/OfxProfileServlet

Account sync:
https://vesnc.vanguard.com/us/OfxDirectConnectServlet
```

If every validated Vanguard route fails during the TCP connect stage, Solpient should treat that as evidence that the legacy endpoint is not generally reachable from the user's network/client path and stop before requesting credentials.


## Solpient Connect V1.4 — OAuth / FDX Framework

Solpient Money 0.7.0 adds a production-aware OAuth/FDX architecture without pretending sandbox OAuth is equivalent to a bank-approved FDX/FAPI integration.

### Provider capability registry

- **Solpient FDX Sandbox** — local end-to-end OAuth 2.0 Authorization Code + PKCE test provider.
- **External FDX Sandbox** — configurable through environment variables.
- **Bank of America / Merrill** — onboarding profile only; no fake production endpoints or client credentials.
- **Chase** — partner-registration profile only; no fake production endpoints or client credentials.

### OAuth security

- Authorization Code flow with PKCE S256.
- Cryptographically random state + verifier.
- HttpOnly, SameSite=Lax, short-lived authorization-flow cookies.
- State validation on callback.
- No bank passwords collected by Solpient.
- Access and refresh tokens encrypted with AES-256-GCM before database storage.
- Refresh-token lifecycle supported.
- Provider redirect and API endpoints must use HTTPS outside localhost.
- Redirect following is disabled for OAuth token and FDX API requests.
- Production FDX/FAPI profiles are explicitly blocked from the sandbox PKCE path.

### FDX / FAPI production gates

The framework models production requirements separately from sandbox OAuth:

- client registration
- FAPI security profile
- Pushed Authorization Requests (PAR)
- mTLS sender-constrained tokens
- institution-specific certificates / onboarding

V1.4 does not downgrade a provider marked `fdx_fapi` to ordinary OAuth just to make a button work.

### Local FDX sandbox

The built-in simulator validates the full Solpient flow:

```text
/connect/fdx
   ↓
OAuth start
   ↓
PKCE + state cookies
   ↓
Solpient FDX Sandbox consent page
   ↓
authorization code
   ↓
callback + state verification
   ↓
token exchange
   ↓
encrypted token vault
   ↓
FDX-aligned /accounts
   ↓
FDX-aligned /accounts/{id}/transactions
   ↓
Normalizer
   ↓
Money accounts / transactions / holdings
```

Synthetic sandbox data is used; no real financial institution or bank credential is involved.

### Optional external sandbox configuration

```bash
FDX_SANDBOX_AUTHORIZATION_URL=
FDX_SANDBOX_TOKEN_URL=
FDX_SANDBOX_API_BASE_URL=
FDX_SANDBOX_CLIENT_ID=
FDX_SANDBOX_CLIENT_SECRET=
FDX_SANDBOX_SCOPES="openid profile ACCOUNT_BASIC TRANSACTIONS INVESTMENTS"
```

`CONNECT_SECRET_ENCRYPTION_KEY` must also be configured because OAuth access/refresh tokens are encrypted before persistence.

### Data provenance

FDX-sourced Money records use:

```text
source = fdx
oauth_fdx_connection_id
fdx_account_id
fdx_transaction_id
fdx_security_id
```

Accounts, transactions, and holdings display an `OAUTH / FDX` provenance badge.

### Verification

```bash
npm run test:connect-v12
npm run test:connect-v13
npm run test:connect-v14
npm run lint
npm run build
```

## V1.0 Local Money Copilot

Solpient Money includes a read-only local financial copilot at `/copilot`.

The Copilot has two layers:

1. **Deterministic Solpient** — always available. Common questions about net worth, cash flow, reserves, debt, recurring bills, portfolio concentration, retirement, financial health, and the 12-month forecast are answered directly from reconciled Solpient calculations.
2. **Local Ollama** — optional. Broader conversational explanations can be handled by a local model running on the same computer.

Ollama is not required for the application to build or for deterministic Copilot questions to work.

To enable a local model:

```bash
# Start Ollama using your normal local installation.
ollama serve

# See which local models are already installed.
ollama list

# Install a chat model of your choice if needed.
ollama pull <model-name>
```

Optionally choose a specific installed model in `.env.local`:

```env
OLLAMA_MODEL=<model-name>
# OLLAMA_BASE_URL=http://127.0.0.1:11434
```

If `OLLAMA_MODEL` is omitted, Solpient selects the first model returned by the local Ollama installation.

### Copilot security boundary

The V1.0 Copilot is intentionally read-only:

- it does not receive database credentials or account last-four identifiers;
- it cannot insert, update, delete, or merge financial records;
- chat history remains in browser memory for the current page session and is not persisted;
- deterministic calculations remain authoritative for displayed household metrics;
- local-model responses are explanations and may be wrong, so important decisions should be checked against the underlying Solpient calculations.

## V1.1 Household Financial Plan

The V1.1 Financial Plan at `/plan` converts the observed monthly household surplus into one deterministic priority waterfall.

The monthly surplus is allocated once, in this sequence:

1. emergency-reserve catch-up toward the household reserve target;
2. extra payment toward debt at or above the household high-interest APR threshold;
3. dated household goals at the monthly amount required to reach each target date;
4. retirement contribution required to reach the tracked retirement target under the household return assumption;
5. any remaining amount stays explicitly flexible / unallocated.

V1.1 also adds:

- debt-avalanche payoff schedules with freed minimum payments rolling forward to the next highest-APR balance;
- modeled interest savings from the plan's extra debt payment;
- editable goal amounts, dates, and priorities;
- editable reserve, debt-threshold, retirement-age, retirement-target, and return assumptions;
- a clear “Why?” and “What changes this?” explanation for every plan line;
- deterministic Money Copilot answers about the household plan.

The plan does not move money or execute payments. It is a read/modeling layer over reconciled Solpient Money data. Household assumptions are user-editable; V1.1 system policies such as the 12-month reserve catch-up and high-interest payoff horizon are displayed separately so the logic remains inspectable.

## V1.2 Continuous Plan Monitoring

The V1.2 Plan Monitor at `/monitor` closes the loop between the V1.1 household plan and what actually happens during the month.

On the first visit in a new month, Solpient stores one monthly V1.1 baseline in `financial_plan_snapshots`. Ordinary transaction updates never rewrite that baseline. If the household intentionally changes a goal or planning policy, the baseline can be reset explicitly from the Monitor page.

V1.2 continuously compares:

- month-to-date income, spending, and surplus against the saved monthly baseline;
- projected month-end spending and surplus against plan;
- current debt payoff timing against the saved payoff horizon;
- dated-goal monthly requirements against their saved baseline;
- retirement contribution requirements against baseline;
- reserve, debt, goal, retirement, and flexible allocation changes.

Monitoring signals use materiality thresholds to suppress small fluctuations. Cash-flow pace is ignored until at least 20% of the month has elapsed. The Plan Alignment score starts at 100; watch signals subtract 10 points and critical signals subtract 22.

Money Copilot can answer questions such as `What changed from my financial plan?` using the saved baseline. The Copilot remains read-only and will never create or reset a monitoring baseline.

The full encrypted PostgreSQL backup already includes the V1.2 snapshot history because local backups use a complete `pg_dump`.

## V1.2.1 Local Database Reliability

V1.2.1 standardizes Solpient Local on one PostgreSQL runtime:

```text
Container: solpient-money-postgres
Host:      127.0.0.1
Port:      5432
Database:  solpient
User:      solpient
```

The canonical password lives in `.env.local-db` as `POSTGRES_PASSWORD`. `npm run local:repair` rewrites the matching `DATABASE_URL` in `.env.local`, starts the canonical container, explicitly synchronizes the real PostgreSQL `solpient` role password, verifies TCP authentication, and applies migrations.

This fixes an important PostgreSQL/Docker behavior: changing `POSTGRES_PASSWORD` after a data volume already exists does not change the role password stored inside PostgreSQL. Solpient now performs that synchronization explicitly.

Useful commands:

```bash
npm run local:repair
npm run local:doctor
npm run dev
```

`npm run dev` now runs through a database preflight wrapper. It reads the canonical URL directly from `.env.local`, rejects legacy local ports/configurations, verifies the database before Next.js starts, and overrides a stale exported shell `DATABASE_URL`.

### Migrating the legacy 55432 database

Older local builds may still use the preserved Docker container:

```text
solpient-local-db-1
```

To safely copy that data into the canonical local database:

```bash
npm run local:migrate-legacy -- --confirm
```

The migration:

- prepares the canonical database first;
- refuses to overwrite a canonical database that already contains household data;
- copies the legacy database with `pg_dump` → `psql`;
- applies current migrations afterward;
- verifies household and account row counts;
- leaves `solpient-local-db-1` untouched as rollback protection.

Do not delete the legacy container until `npm run local:doctor` passes and the expected accounts/transactions are visible in the canonical app.

## V1.2.2 Dynamic Local Database Port

V1.2.2 removes the assumption that host port `5432` is available.

Solpient Local now uses a dedicated configurable host port:

```text
Host:      127.0.0.1
Host port: auto-selected, default 55433
Container: solpient-money-postgres
Container PostgreSQL port: 5432
```

`npm run local:repair` now:

- reuses the published port of a running canonical Solpient container;
- otherwise prefers the persisted `SOLPIENT_DB_PORT`;
- otherwise tries the Solpient default `55433`;
- if occupied, scans `55434` through `55449` for the next free loopback port;
- stores the selected port in both `.env.local-db` and `.env.local`;
- rewrites `DATABASE_URL` with that selected port;
- recreates the canonical container when the port mapping changes;
- synchronizes the real PostgreSQL role password;
- verifies TCP authentication before migrations and again afterward.

`npm run local:doctor` verifies that the Docker env port, Next env port, DATABASE_URL port, and actual Docker binding all match. On macOS it can also report which process is listening on a configured port when Solpient cannot bind it.

This allows Homebrew PostgreSQL, another Docker database, or another application to keep using host port `5432` without blocking Solpient.

## V1.2.3 Safe Legacy Restore

V1.2.3 fixes legacy migration failures caused by restoring an older `--clean` dump into a canonical database that already contains newer schema dependencies.

The safe migration now follows this order:

```text
legacy solpient-local-db-1
        ↓
temporary pg_dump file
        ↓
prepare canonical container only
        ↓
verify canonical DB has no household data
        ↓
recreate the empty canonical solpient database
        ↓
restore legacy dump without --clean
        ↓
apply all current migrations
        ↓
verify household/account/transaction row counts
```

The old legacy container is never modified or deleted.

The temporary dump file is removed after migration. Staging the dump before restore also prevents the prior `EPIPE` failure when `psql` exits early.

Use:

```bash
npm run local:migrate-legacy -- --confirm
```

The command still refuses to overwrite a canonical database that already contains household data.

