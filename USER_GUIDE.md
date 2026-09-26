# Solpient Money — User Guide

## Getting started

1. Install Docker Desktop (or OrbStack/Colima) and Node 20+.
2. `git clone https://github.com/ngkenzy/solpient-money.git && cd solpient-money`
3. `npm ci && npm run local:setup && npm run dev`
4. Open http://localhost:3000 → `/setup`.
5. Pick a path: **explore with demo data** (realistic fake household you can delete later) or **start empty and import your files**.

Your data lives in PostgreSQL running in Docker on your Mac, bound to localhost. Nothing is sent anywhere.

## Importing files

Go to **Connect**. Drop in a CSV, QFX, or OFX from your bank, credit card, or brokerage.

- The importer figures out your file's column layout and remembers it per institution.
- Every row is fingerprinted: importing the same file twice never double-counts.
- Review and confirm before anything is saved. Every import can be undone from the import history.

## Investments

**Portfolio** shows every holding with allocation and gains. Click a position for detail — including a notes field for your own thinking (notes only; the app never trades).

**Budgeting → Financial Plan** runs the waterfall: emergency reserve first, then high-interest debt, then goals and investing, in priority order.

## Budgeting

**Budgeting → Budget** is the monthly budget: set an amount per spending category, and actuals fill in automatically from your categorized transactions. Overspending lights up before the month ends.

## TSP

**Thrift Saving Plan → Import** takes your TSP statement CSV. The app tracks balances and fund breakdowns (C, S, I, F, G) over time.

## Backups

Your Mac holds the only copy of your data. The **Data** page shows your last backup and nags you when it's stale.

Easiest: on the **Data** page, **Download backup** saves an encrypted copy to your machine; **Restore from backup** puts one back (it checks the file is genuine before touching your data).

Terminal alternative:

```bash
npm run local:backup
npm run local:restore -- backups/solpient-money-<timestamp>.sql.gz.enc
```

Backups are compressed and encrypted (AES-256-GCM). Copy `.env.local` and one backup somewhere off the laptop — a USB stick, a cloud drive, anywhere. Without the backup key in `.env.local`, a backup cannot be restored.

## Exporting

On **Transactions**, use **Export CSV** to download exactly what you're looking at (respects your search and filters) — handy for taxes or your accountant.

## FAQ

**Does Solpient Money move my money?** No. It reads and reports. It cannot transfer funds, trade, or pay bills.

**Where is my data?** In PostgreSQL in Docker on your Mac, `127.0.0.1` only. Delete the container and the data is gone — which is why backups matter.

**Can I use it on my phone?** The app is a local web app. On the same Wi-Fi network you can reach it from another device, but the database stays on the Mac.

**I messed up an import.** Import history on the Connect page lets you undo any import.

**How do I update?** `git pull`, then `npm ci` if dependencies changed, then `npm run dev`. Migrations apply automatically and are checksum-guarded — if anything looks off, the app refuses to start rather than corrupt data.
