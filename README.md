# Solpient Money

**Your money, on your Mac. Nothing in the cloud.**

Solpient Money is a personal finance app that runs entirely on your computer. It tracks your investments, spending, monthly budgets, and TSP — and your financial data never leaves your machine. No accounts, no subscriptions, no cloud sync, no ads, no selling your data. There is nothing to sell because there is nothing to collect.

## Who it's for

People who want a clear picture of their money without handing their bank logins to a cloud service. If you're comfortable downloading a CSV from your bank and dropping it into an app, this is for you.

## The four pillars

- **Investments** — Holdings, allocation, and performance vs. benchmark, with per-position notes. Deterministic math, no black boxes.
- **Spending** — Every transaction categorized automatically, cash-flow intelligence, and a truth engine that deduplicates imports so the numbers stay honest.
- **Budgeting** — Real monthly budgets per category with actuals tracked from your transactions, plus a financial plan waterfall for the bigger picture.
- **TSP** — Thrift Savings Plan tracking with statement import and fund breakdowns (C, S, I, F, G).

Plus the essentials: file import (CSV/QFX/OFX), manual entry, encrypted local backups, and CSV export for your accountant.

## Privacy: local-first by architecture, not by promise

```text
Browser → Next.js on your Mac → PostgreSQL 17 in Docker → 127.0.0.1 only
```

Your database is bound to localhost. There is no hosted backend to breach, no analytics beacon, no third party that sees your balances. Connector credentials are encrypted with AES-256-GCM. The app never moves money, never trades, never pays bills — it reads and reports.

## Install in 5 minutes

Prerequisites: Docker Desktop (or OrbStack/Colima) and Node 20+.

```bash
git clone https://github.com/ngkenzy/solpient-money.git ~/Documents/solpient-money
cd ~/Documents/solpient-money
npm ci
npm run local:setup
npm run dev
```

Open **http://localhost:3000**, then `/setup`: create your household, explore with demo data or start empty and import your first file.

Day to day: `npm run dev` (with Docker running). Diagnose: `npm run local:doctor`.

## Backups — you own them

Local-first means your Mac holds the only copy. The app nags you about it on the Data page.

Easiest: on the **Data** page, **Download backup** saves an encrypted copy to your machine; **Restore from backup** puts one back (it checks the file is genuine before touching your data). Backups are compressed and encrypted (AES-256-GCM).

Terminal alternative:

```bash
npm run local:backup    # encrypted, AES-256-GCM, into backups/
npm run local:restore -- backups/solpient-money-<timestamp>.sql.gz.enc
```

Keep `.env.local` and at least one backup copy off the laptop. Without the backup encryption key, a backup cannot be restored.

## Importing your data

- **Files** (`/connect`): drag in CSV, QFX, or OFX from any bank or brokerage. The importer learns your bank's column layout, fingerprints every row, and re-importing the same file can never double-count. Every import is undoable.
- **TSP** (`/tsp/import`): CSV-first statement import.
- **Manual** (`/data`): add accounts, transactions, holdings, and goals by hand.

## Cost

$0 in hosted fees. PostgreSQL Docker image: $0. Storage: your disk. Runtime: your Mac. File imports: $0.

## Docs

- [USER_GUIDE.md](USER_GUIDE.md) — setup, importing, budgeting, TSP, backups, FAQ.

## Changelog

- **V3.0 "Simple"** — The simplification release. Four pillars (Investments, Spending, Budgeting, TSP), everything else removed. New monthly budget page, guided setup, empty states everywhere, CSV export, backup health nudges, rewritten docs.
- V2.0.x — Local-first architecture, TSP tracker, import reliability hardening.
