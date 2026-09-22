import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { requireActiveHousehold } from "@/lib/money-auth";

type AccountRow = {
  id: string;
  name: string;
  institution?: string | null;
  account_type?: string | null;
  last_four?: string | null;
  source?: string | null;
  created_at?: unknown;
  updated_at?: unknown;
  last_file_import_at?: unknown;
  identity_key?: string | null;
  identity_confidence?: unknown;
  canonical_account_id?: string | null;
  data_health_status?: string | null;
  truth_checked_at?: unknown;
};

type TransactionRow = {
  id: string;
  account_id?: string | null;
  posted_at: unknown;
  merchant: string;
  category?: string | null;
  amount_cents: unknown;
  transaction_type?: string | null;
  source?: string | null;
  normalized_merchant?: string | null;
  truth_fingerprint?: string | null;
  duplicate_of_transaction_id?: string | null;
  detected_transfer?: boolean | null;
  transfer_group_id?: string | null;
  truth_confidence?: unknown;
  truth_checked_at?: unknown;
};

export type TruthEngineSummary = {
  accountsScanned: number;
  duplicateAccountCandidates: number;
  staleAccounts: number;
  transactionsScanned: number;
  normalizedTransactions: number;
  duplicateTransactions: number;
  detectedTransfers: number;
  lastRunAt: string | null;
};

export type TruthAccountHealth = {
  id: string;
  name: string;
  institution: string;
  source: string;
  lastFour: string;
  status: "unreviewed" | "healthy" | "stale" | "duplicate_candidate" | "needs_review";
  identityConfidence: number;
  canonicalAccountName: string | null;
  lastUpdatedAt: string | null;
};

export type TruthTransactionSignal = {
  id: string;
  postedAt: string;
  merchant: string;
  normalizedMerchant: string;
  amount: number;
  source: string;
  signal: "duplicate" | "transfer";
  confidence: number;
};

export type TruthEngineReport = {
  summary: TruthEngineSummary;
  accounts: TruthAccountHealth[];
  signals: TruthTransactionSignal[];
};

const SOURCE_RANK: Record<string, number> = {
  fdx: 100,
  plaid: 95,
  ofx_direct: 90,
  file: 70,
  manual: 60,
  demo: 10,
};

function sourceRank(source: unknown) {
  return SOURCE_RANK[String(source ?? "").toLowerCase()] ?? 40;
}

function simpleText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  const preserve = new Set(["ACH", "ATM", "CVS", "FDX", "HSA", "IRA", "IRS", "UPS", "USAA"]);
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase();
      if (preserve.has(upper)) return upper;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function normalizeMerchant(value: unknown) {
  let merchant = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();

  merchant = merchant
    .replace(/^(POS|DEBIT|PURCHASE|CHECKCARD|CARD PURCHASE|ACH DEBIT)\s+/i, "")
    .replace(/^SQ\s*\*\s*/i, "")
    .replace(/^TST\s*\*\s*/i, "")
    .replace(/^PAYPAL\s*\*\s*/i, "")
    .replace(/\b(?:REF|TRACE|AUTH|ID)\s*#?\s*[A-Z0-9-]{5,}\b/gi, "")
    .replace(/\s+#?\d{5,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const aliasKey = simpleText(merchant);
  const aliases: Array<[RegExp, string]> = [
    [/^amzn(?: mktp| marketplace| digital)?\b/, "Amazon"],
    [/^amazon(?: com| marketplace)?\b/, "Amazon"],
    [/^(?:wal mart|walmart)\b/, "Walmart"],
    [/^costco(?: whse| wholesale)?\b/, "Costco"],
    [/^starbucks\b/, "Starbucks"],
    [/^apple com bill\b/, "Apple"],
    [/^google\s+\*?\b/, "Google"],
  ];

  for (const [pattern, replacement] of aliases) {
    if (pattern.test(aliasKey)) return replacement;
  }

  return titleCase(simpleText(merchant)) || "Unknown";
}

function isoDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function isoInstant(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function ageDays(value: unknown) {
  const instant = isoInstant(value);
  if (!instant) return null;
  return Math.max(0, (Date.now() - new Date(instant).getTime()) / 86_400_000);
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function identityLastFour(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

export function deriveAccountIdentity(account: Pick<AccountRow, "name" | "institution" | "account_type" | "last_four">) {
  const institution = simpleText(account.institution || "unknown");
  const type = simpleText(account.account_type || "unknown");
  const lastFour = identityLastFour(account.last_four);

  if (lastFour) {
    return {
      key: [institution, type, lastFour].join("|"),
      confidence: institution === "manual" || institution === "unknown" ? 0.84 : 0.97,
    };
  }

  const name = simpleText(account.name);
  return {
    key: [institution, type, name].join("|"),
    confidence: name ? 0.68 : 0.45,
  };
}

function accountFreshnessStatus(account: AccountRow) {
  const source = String(account.source ?? "manual").toLowerCase();

  if (source === "file") {
    const days = ageDays(account.last_file_import_at ?? account.updated_at);
    return days != null && days > 14 ? "stale" : "healthy";
  }

  if (["plaid", "fdx", "ofx_direct"].includes(source)) {
    const days = ageDays(account.updated_at);
    return days != null && days > 7 ? "stale" : "healthy";
  }

  return "healthy";
}

function canonicalSort(a: AccountRow, b: AccountRow) {
  const sourceDifference = sourceRank(b.source) - sourceRank(a.source);
  if (sourceDifference !== 0) return sourceDifference;

  const aDate = isoInstant(a.created_at) ?? "";
  const bDate = isoInstant(b.created_at) ?? "";
  return aDate.localeCompare(bDate);
}

function transactionFingerprint(
  transaction: TransactionRow,
  normalizedMerchant: string,
  canonicalAccountId: string
) {
  const raw = [
    canonicalAccountId,
    isoDate(transaction.posted_at),
    Math.round(numeric(transaction.amount_cents)),
    normalizedMerchant.toLowerCase(),
    String(transaction.transaction_type ?? ""),
  ].join("|");

  return createHash("sha256").update(raw).digest("hex");
}

function transferHint(transaction: TransactionRow, normalizedMerchant: string) {
  const text = [
    transaction.merchant,
    normalizedMerchant,
    transaction.category,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return /\b(transfer|xfer|payment|payoff|sweep|brokerage|ach)\b/.test(text);
}

function dayDistance(a: unknown, b: unknown) {
  const left = isoDate(a);
  const right = isoDate(b);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(
    new Date(left + "T12:00:00Z").getTime() -
      new Date(right + "T12:00:00Z").getTime()
  ) / 86_400_000;
}

export async function runTruthEngineForHousehold(): Promise<TruthEngineSummary> {
  const { supabase, householdId } = await requireActiveHousehold();
  const [{ data: accountData, error: accountError }, { data: transactionData, error: transactionError }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      supabase
        .from("transactions")
        .select("*")
        .eq("household_id", householdId)
        .order("posted_at", { ascending: true })
        .limit(5000),
    ]);

  if (accountError) throw new Error(accountError.message);
  if (transactionError) throw new Error(transactionError.message);

  const accounts = (accountData ?? []) as AccountRow[];
  const transactions = (transactionData ?? []) as TransactionRow[];
  const now = new Date().toISOString();

  const identityGroups = new Map<string, AccountRow[]>();
  const identities = new Map<string, ReturnType<typeof deriveAccountIdentity>>();

  for (const account of accounts) {
    const identity = deriveAccountIdentity(account);
    identities.set(String(account.id), identity);
    const bucket = identityGroups.get(identity.key) ?? [];
    bucket.push(account);
    identityGroups.set(identity.key, bucket);
  }

  const canonicalByAccount = new Map<string, string>();
  const accountStatus = new Map<string, string>();
  let duplicateAccountCandidates = 0;
  let staleAccounts = 0;

  for (const group of identityGroups.values()) {
    const ordered = [...group].sort(canonicalSort);
    const canonical = ordered[0];

    for (const account of ordered) {
      const identity = identities.get(String(account.id))!;
      const isDuplicate = account.id !== canonical.id && identity.confidence >= 0.8;
      const freshness = accountFreshnessStatus(account);
      let status = identity.confidence < 0.6 ? "needs_review" : freshness;

      if (isDuplicate) {
        status = "duplicate_candidate";
        duplicateAccountCandidates += 1;
      } else if (status === "stale") {
        staleAccounts += 1;
      }

      canonicalByAccount.set(String(account.id), String(canonical.id));
      accountStatus.set(String(account.id), status);

      const { error } = await supabase
        .from("accounts")
        .update({
          identity_key: identity.key,
          identity_confidence: identity.confidence,
          canonical_account_id: isDuplicate ? canonical.id : null,
          data_health_status: status,
          truth_checked_at: now,
        })
        .eq("id", account.id)
        .eq("household_id", householdId);

      if (error) throw new Error(error.message);
    }
  }

  const states = transactions.map((transaction) => {
    const normalizedMerchant = normalizeMerchant(transaction.merchant);
    const canonicalAccountId =
      canonicalByAccount.get(String(transaction.account_id ?? "")) ??
      String(transaction.account_id ?? "unassigned");

    return {
      row: transaction,
      canonicalAccountId,
      normalizedMerchant,
      fingerprint: transactionFingerprint(transaction, normalizedMerchant, canonicalAccountId),
      duplicateOf: null as string | null,
      detectedTransfer: false,
      transferGroupId: null as string | null,
      confidence: 0.8,
    };
  });

  const fingerprintGroups = new Map<string, typeof states>();
  for (const state of states) {
    const bucket = fingerprintGroups.get(state.fingerprint) ?? [];
    bucket.push(state);
    fingerprintGroups.set(state.fingerprint, bucket);
  }

  let duplicateTransactions = 0;

  for (const group of fingerprintGroups.values()) {
    if (group.length < 2) continue;

    const distinctSources = new Set(group.map((state) => String(state.row.source ?? "")));
    if (distinctSources.size < 2) continue;

    const ordered = [...group].sort(
      (a, b) =>
        sourceRank(b.row.source) - sourceRank(a.row.source) ||
        String(a.row.id).localeCompare(String(b.row.id))
    );
    const keeper = ordered[0];

    for (const duplicate of ordered.slice(1)) {
      duplicate.duplicateOf = String(keeper.row.id);
      duplicate.confidence = 0.99;
      duplicateTransactions += 1;
    }
  }

  const available = states
    .filter((state) => !state.duplicateOf && state.row.account_id)
    .sort((a, b) => isoDate(a.row.posted_at).localeCompare(isoDate(b.row.posted_at)));

  const paired = new Set<string>();
  let detectedTransfers = 0;

  for (let i = 0; i < available.length; i += 1) {
    const left = available[i];
    if (paired.has(String(left.row.id))) continue;

    const leftAmount = Math.round(numeric(left.row.amount_cents));
    if (leftAmount === 0) continue;

    for (let j = i + 1; j < available.length; j += 1) {
      const right = available[j];
      if (paired.has(String(right.row.id))) continue;
      if (left.canonicalAccountId === right.canonicalAccountId) continue;
      if (dayDistance(left.row.posted_at, right.row.posted_at) > 3) break;

      const rightAmount = Math.round(numeric(right.row.amount_cents));
      if (leftAmount + rightAmount !== 0) continue;
      if (Math.abs(leftAmount) < 1000) continue;

      const hinted =
        transferHint(left.row, left.normalizedMerchant) ||
        transferHint(right.row, right.normalizedMerchant);

      if (!hinted) continue;

      const groupId = randomUUID();
      left.detectedTransfer = true;
      right.detectedTransfer = true;
      left.transferGroupId = groupId;
      right.transferGroupId = groupId;
      left.confidence = Math.max(left.confidence, 0.93);
      right.confidence = Math.max(right.confidence, 0.93);
      paired.add(String(left.row.id));
      paired.add(String(right.row.id));
      detectedTransfers += 1;
      break;
    }
  }

  for (const state of states) {
    const { error } = await supabase
      .from("transactions")
      .update({
        normalized_merchant: state.normalizedMerchant,
        truth_fingerprint: state.fingerprint,
        duplicate_of_transaction_id: state.duplicateOf,
        detected_transfer: state.detectedTransfer,
        transfer_group_id: state.transferGroupId,
        truth_confidence: state.confidence,
        truth_checked_at: now,
      })
      .eq("id", state.row.id)
      .eq("household_id", householdId);

    if (error) throw new Error(error.message);
  }

  return {
    accountsScanned: accounts.length,
    duplicateAccountCandidates,
    staleAccounts,
    transactionsScanned: transactions.length,
    normalizedTransactions: states.length,
    duplicateTransactions,
    detectedTransfers,
    lastRunAt: now,
  };
}

export async function getTruthEngineReport(): Promise<TruthEngineReport> {
  const { supabase, householdId } = await requireActiveHousehold();
  const [{ data: accountData, error: accountError }, { data: transactionData, error: transactionError }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .eq("household_id", householdId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("transactions")
        .select("*")
        .eq("household_id", householdId)
        .order("posted_at", { ascending: false })
        .limit(5000),
    ]);

  if (accountError) throw new Error(accountError.message);
  if (transactionError) throw new Error(transactionError.message);

  const accounts = (accountData ?? []) as AccountRow[];
  const transactions = (transactionData ?? []) as TransactionRow[];
  const accountNames = new Map(accounts.map((account) => [String(account.id), String(account.name)]));

  const accountHealth: TruthAccountHealth[] = accounts.map((account) => ({
    id: String(account.id),
    name: String(account.name),
    institution: String(account.institution ?? "Manual"),
    source: String(account.source ?? "manual"),
    lastFour: String(account.last_four ?? "—"),
    status: (account.data_health_status ?? "unreviewed") as TruthAccountHealth["status"],
    identityConfidence: numeric(account.identity_confidence),
    canonicalAccountName: account.canonical_account_id
      ? accountNames.get(String(account.canonical_account_id)) ?? "Linked account"
      : null,
    lastUpdatedAt: isoInstant(account.last_file_import_at ?? account.updated_at),
  }));

  const signals: TruthTransactionSignal[] = transactions
    .filter((transaction) => transaction.duplicate_of_transaction_id || transaction.detected_transfer)
    .slice(0, 100)
    .map((transaction) => ({
      id: String(transaction.id),
      postedAt: isoDate(transaction.posted_at),
      merchant: String(transaction.merchant),
      normalizedMerchant: String(transaction.normalized_merchant ?? normalizeMerchant(transaction.merchant)),
      amount: numeric(transaction.amount_cents) / 100,
      source: String(transaction.source ?? "manual"),
      signal: transaction.duplicate_of_transaction_id ? "duplicate" : "transfer",
      confidence: numeric(transaction.truth_confidence),
    }));

  const checked = [
    ...accounts.map((account) => isoInstant(account.truth_checked_at)),
    ...transactions.map((transaction) => isoInstant(transaction.truth_checked_at)),
  ]
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    summary: {
      accountsScanned: accounts.length,
      duplicateAccountCandidates: accountHealth.filter((account) => account.status === "duplicate_candidate").length,
      staleAccounts: accountHealth.filter((account) => account.status === "stale").length,
      transactionsScanned: transactions.length,
      normalizedTransactions: transactions.filter((transaction) => transaction.normalized_merchant).length,
      duplicateTransactions: transactions.filter((transaction) => transaction.duplicate_of_transaction_id).length,
      detectedTransfers: Math.floor(transactions.filter((transaction) => transaction.detected_transfer).length / 2),
      lastRunAt: checked.at(-1) ?? null,
    },
    accounts: accountHealth,
    signals,
  };
}
