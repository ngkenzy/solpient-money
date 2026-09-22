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
