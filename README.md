# Solpient Money

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
