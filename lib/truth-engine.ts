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
  is_active?: boolean | null;
  created_at?: unknown;
  updated_at?: unknown;
  last_file_import_at?: unknown;
  identity_key?: string | null;
  identity_confidence?: unknown;
  canonical_account_id?: string | null;
  data_health_status?: string | null;
  identity_review_status?: string | null;
  merged_at?: unknown;
  truth_checked_at?: unknown;
};

type TransactionRow = {
  id: string;
  account_id?: string | null;
  posted_at: unknown;
  merchant: string;
  category?: string | null;
  truth_category?: string | null;
  amount_cents: unknown;
  transaction_type?: string | null;
  source?: string | null;
  normalized_merchant?: string | null;
  truth_fingerprint?: string | null;
  duplicate_of_transaction_id?: string | null;
  detected_transfer?: boolean | null;
  transfer_group_id?: string | null;
  duplicate_review_status?: string | null;
  transfer_review_status?: string | null;
  truth_confidence?: unknown;
  truth_checked_at?: unknown;
};

type MerchantRuleRow = {
  id: string;
  match_merchant: string;
  normalized_merchant?: string | null;
  category?: string | null;
  priority?: unknown;
  is_active?: boolean | null;
  created_at?: unknown;
};

type MergeAuditRow = {
  id: string;
  duplicate_account_id: string;
  canonical_account_id: string;
  moved_transaction_count?: unknown;
  reassigned_holding_count?: unknown;
  suppressed_holding_count?: unknown;
  created_at?: unknown;
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
  isActive: boolean;
  status:
    | "unreviewed"
    | "healthy"
    | "stale"
    | "duplicate_candidate"
    | "needs_review"
    | "merged";
  reviewStatus: "unreviewed" | "confirmed_duplicate" | "not_duplicate";
  identityConfidence: number;
  canonicalAccountId: string | null;
  canonicalAccountName: string | null;
  lastUpdatedAt: string | null;
};

export type TruthTransactionSignal = {
  id: string;
  postedAt: string;
  merchant: string;
  normalizedMerchant: string;
  accountName: string;
  amount: number;
  source: string;
  signal: "duplicate" | "transfer";
  confidence: number;
  duplicateOfId: string | null;
  transferGroupId: string | null;
  duplicateReviewStatus: "unreviewed" | "confirmed" | "rejected";
  transferReviewStatus: "unreviewed" | "confirmed" | "rejected";
};

export type TruthTransferCandidate = {
  id: string;
  postedAt: string;
  merchant: string;
  accountId: string;
  accountName: string;
  amount: number;
};

export type TruthMerchantRule = {
  id: string;
  matchMerchant: string;
  normalizedMerchant: string | null;
  category: string | null;
  priority: number;
};

export type TruthMergeAudit = {
  id: string;
  duplicateAccountName: string;
  canonicalAccountName: string;
  movedTransactions: number;
  reassignedHoldings: number;
  suppressedHoldings: number;
  createdAt: string | null;
};

export type TruthEngineReport = {
  summary: TruthEngineSummary;
  accounts: TruthAccountHealth[];
  signals: TruthTransactionSignal[];
  transferCandidates: TruthTransferCandidate[];
  merchantRules: TruthMerchantRule[];
  mergeAudits: TruthMergeAudit[];
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
  const preserve = new Set([
    "ACH",
    "ATM",
    "CVS",
    "FDX",
    "HSA",
    "IRA",
    "IRS",
    "UPS",
    "USAA",
  ]);

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

export function merchantRuleKey(value: unknown) {
  return simpleText(normalizeMerchant(value));
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
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return normalized.length >= 4 && /\d/.test(normalized)
    ? normalized.slice(-4)
    : "";
}

export function deriveAccountIdentity(
  account: Pick<AccountRow, "name" | "institution" | "account_type" | "last_four">
) {
  const institution = simpleText(account.institution || "unknown");
  const type = simpleText(account.account_type || "unknown");
  const lastFour = identityLastFour(account.last_four);

  if (lastFour) {
    return {
      key: [institution, type, lastFour].join("|"),
      confidence:
        institution === "manual" || institution === "unknown" ? 0.84 : 0.97,
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
  const aRejected = a.identity_review_status === "not_duplicate" ? 1 : 0;
  const bRejected = b.identity_review_status === "not_duplicate" ? 1 : 0;
  if (aRejected !== bRejected) return aRejected - bRejected;

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

function accountInstitutionAliases(account: AccountRow | undefined) {
  const institution = simpleText(account?.institution ?? "");
  if (!institution) return [];

  if (institution.includes("bank of america")) {
    return ["bank of america", "bofa"];
  }
  if (institution.includes("vanguard")) return ["vanguard"];
  if (institution.includes("merrill")) return ["merrill"];
  if (institution.includes("american express")) {
    return ["american express", "amex"];
  }
  if (institution.includes("chase")) return ["chase"];
  if (institution.includes("navy federal")) {
    return ["navy federal", "nfcu"];
  }
  if (institution.includes("thrift savings plan")) {
    return ["thrift savings plan", "tsp"];
  }

  return institution.length >= 5 ? [institution] : [];
}

function tokenAppears(text: string, token: string) {
  const normalizedText = simpleText(text);
  const normalizedToken = simpleText(token);
  if (!normalizedToken) return false;

  return (
    normalizedText === normalizedToken ||
    normalizedText.startsWith(normalizedToken + " ") ||
    normalizedText.endsWith(" " + normalizedToken) ||
    normalizedText.includes(" " + normalizedToken + " ")
  );
}

function transferPairScore(
  left: {
    row: TransactionRow;
    canonicalAccountId: string;
    normalizedMerchant: string;
  },
  right: {
    row: TransactionRow;
    canonicalAccountId: string;
    normalizedMerchant: string;
  },
  accountById: Map<string, AccountRow>,
  accounts: AccountRow[]
) {
  const knownMasks = Array.from(
    new Set(
      accounts
        .map((account) => identityLastFour(account.last_four))
        .filter(Boolean)
    )
  );

  let score = 1;
  let directHint = false;

  const directions = [
    {
      state: left,
      source: accountById.get(left.canonicalAccountId),
      target: accountById.get(right.canonicalAccountId),
    },
    {
      state: right,
      source: accountById.get(right.canonicalAccountId),
      target: accountById.get(left.canonicalAccountId),
    },
  ];

  for (const direction of directions) {
    const text = [
      direction.state.row.merchant,
      direction.state.normalizedMerchant,
      direction.state.row.category,
    ].join(" ");

    const sourceMask = identityLastFour(
      direction.source?.last_four
    );
    const targetMask = identityLastFour(
      direction.target?.last_four
    );

    const mentionedMasks = knownMasks.filter((mask) =>
      tokenAppears(text, mask)
    );
    const foreignMasks = mentionedMasks.filter(
      (mask) => mask !== sourceMask
    );

    if (foreignMasks.length) {
      if (
        targetMask &&
        foreignMasks.includes(targetMask) &&
        foreignMasks.every((mask) => mask === targetMask)
      ) {
        score += 6;
        directHint = true;
      } else {
        return {
          compatible: false,
          score: -1,
          directHint: false,
        };
      }
    }

    const targetAliases = accountInstitutionAliases(
      direction.target
    );
    if (
      targetAliases.some((alias) =>
        tokenAppears(text, alias)
      )
    ) {
      score += 3;
      directHint = true;
    }
  }

  return {
    compatible: true,
    score,
    directHint,
  };
}

function dayDistance(a: unknown, b: unknown) {
  const left = isoDate(a);
  const right = isoDate(b);
  if (!left || !right) return Number.POSITIVE_INFINITY;

  return (
    Math.abs(
      new Date(left + "T12:00:00Z").getTime() -
        new Date(right + "T12:00:00Z").getTime()
    ) / 86_400_000
  );
}

function uniqueTransferCount(states: Array<{ detectedTransfer: boolean; transferGroupId: string | null }>) {
  return new Set(
    states
      .filter((state) => state.detectedTransfer && state.transferGroupId)
      .map((state) => state.transferGroupId as string)
  ).size;
}

export async function runTruthEngineForHousehold(): Promise<TruthEngineSummary> {
  const { supabase, householdId } = await requireActiveHousehold();

  const [
    { data: accountData, error: accountError },
    { data: transactionData, error: transactionError },
    { data: ruleData, error: ruleError },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .order("posted_at", { ascending: true })
      .limit(5000),
    supabase
      .from("truth_merchant_rules")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (accountError) throw new Error(accountError.message);
  if (transactionError) throw new Error(transactionError.message);
  if (ruleError) throw new Error(ruleError.message);

  const accounts = (accountData ?? []) as AccountRow[];
  const transactions = (transactionData ?? []) as TransactionRow[];
  const rules = (ruleData ?? []) as MerchantRuleRow[];
  const accountById = new Map(
    accounts.map((account) => [
      String(account.id),
      account,
    ])
  );
  const now = new Date().toISOString();

  const ruleMap = new Map<string, MerchantRuleRow>();
  for (const rule of rules) {
    if (!ruleMap.has(String(rule.match_merchant))) {
      ruleMap.set(String(rule.match_merchant), rule);
    }
  }

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
  let duplicateAccountCandidates = 0;
  let staleAccounts = 0;

  for (const group of identityGroups.values()) {
    const ordered = [...group].sort(canonicalSort);
    const canonical = ordered[0];

    for (const account of ordered) {
      const identity = identities.get(String(account.id))!;
      const reviewStatus = String(account.identity_review_status ?? "unreviewed");
      const autoDuplicate =
        account.id !== canonical.id &&
        identity.confidence >= 0.8 &&
        reviewStatus === "unreviewed";

      const freshness = accountFreshnessStatus(account);
      let status =
        identity.confidence < 0.6 ? "needs_review" : freshness;

      if (reviewStatus === "not_duplicate") {
        status = freshness;
      } else if (autoDuplicate) {
        status = "duplicate_candidate";
        duplicateAccountCandidates += 1;
      }

      if (status === "stale") staleAccounts += 1;

      canonicalByAccount.set(
        String(account.id),
        reviewStatus === "not_duplicate" ? String(account.id) : String(canonical.id)
      );

      const { error } = await supabase
        .from("accounts")
        .update({
          identity_key: identity.key,
          identity_confidence: identity.confidence,
          canonical_account_id: autoDuplicate ? canonical.id : null,
          data_health_status: status,
          truth_checked_at: now,
        })
        .eq("id", account.id)
        .eq("household_id", householdId);

      if (error) throw new Error(error.message);
    }
  }

  const states = transactions.map((transaction) => {
    const builtInMerchant = normalizeMerchant(transaction.merchant);
    const rule = ruleMap.get(merchantRuleKey(builtInMerchant));
    const normalizedMerchant =
      String(rule?.normalized_merchant ?? "").trim() || builtInMerchant;
    const canonicalAccountId =
      canonicalByAccount.get(String(transaction.account_id ?? "")) ??
      String(transaction.account_id ?? "unassigned");

    const duplicateReviewStatus = String(
      transaction.duplicate_review_status ?? "unreviewed"
    );
    const transferReviewStatus = String(
      transaction.transfer_review_status ?? "unreviewed"
    );

    return {
      row: transaction,
      canonicalAccountId,
      normalizedMerchant,
      truthCategory: String(rule?.category ?? "").trim() || null,
      fingerprint: transactionFingerprint(
        transaction,
        normalizedMerchant,
        canonicalAccountId
      ),
      duplicateReviewStatus,
      transferReviewStatus,
      duplicateOf:
        duplicateReviewStatus === "confirmed"
          ? String(transaction.duplicate_of_transaction_id ?? "") || null
          : null,
      detectedTransfer: transferReviewStatus === "confirmed",
      transferGroupId:
        transferReviewStatus === "confirmed"
          ? String(transaction.transfer_group_id ?? "") || null
          : null,
      confidence:
        duplicateReviewStatus === "confirmed" ||
        transferReviewStatus === "confirmed"
          ? 1
          : 0.8,
    };
  });

  const fingerprintGroups = new Map<string, typeof states>();
  for (const state of states) {
    const bucket = fingerprintGroups.get(state.fingerprint) ?? [];
    bucket.push(state);
    fingerprintGroups.set(state.fingerprint, bucket);
  }

  for (const group of fingerprintGroups.values()) {
    if (group.length < 2) continue;

    const distinctSources = new Set(
      group.map((state) => String(state.row.source ?? ""))
    );
    if (distinctSources.size < 2) continue;

    const keeperCandidates = group.filter(
      (state) => state.duplicateReviewStatus !== "confirmed"
    );
    const keeper = [...(keeperCandidates.length ? keeperCandidates : group)].sort(
      (a, b) =>
        sourceRank(b.row.source) - sourceRank(a.row.source) ||
        String(a.row.id).localeCompare(String(b.row.id))
    )[0];

    for (const duplicate of group) {
      if (duplicate.row.id === keeper.row.id) continue;
      if (duplicate.duplicateReviewStatus !== "unreviewed") continue;

      duplicate.duplicateOf = String(keeper.row.id);
      duplicate.confidence = 0.99;
    }
  }

  const available = states
    .filter(
      (state) =>
        !state.duplicateOf &&
        state.row.account_id &&
        state.transferReviewStatus === "unreviewed"
    )
    .sort((a, b) =>
      isoDate(a.row.posted_at).localeCompare(isoDate(b.row.posted_at))
    );

  const paired = new Set<string>();

  for (let i = 0; i < available.length; i += 1) {
    const left = available[i];
    if (paired.has(String(left.row.id))) continue;

    const leftAmount = Math.round(
      numeric(left.row.amount_cents)
    );
    if (leftAmount === 0) continue;

    const candidates: Array<{
      right: (typeof available)[number];
      score: number;
      directHint: boolean;
      distance: number;
    }> = [];

    for (let j = i + 1; j < available.length; j += 1) {
      const right = available[j];
      if (paired.has(String(right.row.id))) continue;
      if (
        left.canonicalAccountId ===
        right.canonicalAccountId
      ) {
        continue;
      }

      const distance = dayDistance(
        left.row.posted_at,
        right.row.posted_at
      );
      if (distance > 3) break;

      const rightAmount = Math.round(
        numeric(right.row.amount_cents)
      );
      if (leftAmount + rightAmount !== 0) continue;
      if (Math.abs(leftAmount) < 1000) continue;

      const hinted =
        transferHint(
          left.row,
          left.normalizedMerchant
        ) ||
        transferHint(
          right.row,
          right.normalizedMerchant
        );

      if (!hinted) continue;

      const compatibility = transferPairScore(
        left,
        right,
        accountById,
        accounts
      );

      if (!compatibility.compatible) continue;

      const explicitlyTypedTransfer =
        String(left.row.transaction_type ?? "") ===
          "transfer" ||
        String(right.row.transaction_type ?? "") ===
          "transfer";

      if (
        !compatibility.directHint &&
        !explicitlyTypedTransfer
      ) {
        continue;
      }

      candidates.push({
        right,
        score: compatibility.score,
        directHint: compatibility.directHint,
        distance,
      });
    }

    if (!candidates.length) continue;

    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.distance - b.distance ||
        String(a.right.row.id).localeCompare(
          String(b.right.row.id)
        )
    );

    const best = candidates[0];
    const equallyStrong = candidates.filter(
      (candidate) =>
        candidate.score === best.score &&
        candidate.distance === best.distance
    );

    if (
      !best.directHint &&
      candidates.length !== 1
    ) {
      continue;
    }

    if (equallyStrong.length > 1) {
      continue;
    }

    const right = best.right;
    const groupId = randomUUID();
    left.detectedTransfer = true;
    right.detectedTransfer = true;
    left.transferGroupId = groupId;
    right.transferGroupId = groupId;

    const confidence = best.directHint
      ? 0.98
      : 0.88;

    left.confidence = Math.max(
      left.confidence,
      confidence
    );
    right.confidence = Math.max(
      right.confidence,
      confidence
    );

    paired.add(String(left.row.id));
    paired.add(String(right.row.id));
  }

  for (const state of states) {
    const { error } = await supabase
      .from("transactions")
      .update({
        normalized_merchant: state.normalizedMerchant,
        truth_category: state.truthCategory,
        truth_fingerprint: state.fingerprint,
        duplicate_of_transaction_id:
          state.duplicateReviewStatus === "rejected" ? null : state.duplicateOf,
        detected_transfer:
          state.transferReviewStatus === "rejected"
            ? false
            : state.detectedTransfer,
        transfer_group_id:
          state.transferReviewStatus === "rejected"
            ? null
            : state.transferGroupId,
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
    duplicateTransactions: states.filter((state) => Boolean(state.duplicateOf))
      .length,
    detectedTransfers: uniqueTransferCount(states),
    lastRunAt: now,
  };
}

export async function getTruthEngineReport(): Promise<TruthEngineReport> {
  const { supabase, householdId } = await requireActiveHousehold();

  const [
    { data: accountData, error: accountError },
    { data: transactionData, error: transactionError },
    { data: ruleData, error: ruleError },
    { data: mergeAuditData, error: mergeAuditError },
  ] = await Promise.all([
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
    supabase
      .from("truth_merchant_rules")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("account_merge_audit")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (accountError) throw new Error(accountError.message);
  if (transactionError) throw new Error(transactionError.message);
  if (ruleError) throw new Error(ruleError.message);
  if (mergeAuditError) throw new Error(mergeAuditError.message);

  const accounts = (accountData ?? []) as AccountRow[];
  const transactions = (transactionData ?? []) as TransactionRow[];
  const rules = (ruleData ?? []) as MerchantRuleRow[];
  const mergeAudits = (mergeAuditData ?? []) as MergeAuditRow[];
  const accountNames = new Map(
    accounts.map((account) => [String(account.id), String(account.name)])
  );

  const accountHealth: TruthAccountHealth[] = accounts.map((account) => ({
    id: String(account.id),
    name: String(account.name),
    institution: String(account.institution ?? "Manual"),
    source: String(account.source ?? "manual"),
    lastFour: String(account.last_four ?? "—"),
    isActive: account.is_active !== false,
    status: (account.data_health_status ??
      "unreviewed") as TruthAccountHealth["status"],
    reviewStatus: (account.identity_review_status ??
      "unreviewed") as TruthAccountHealth["reviewStatus"],
    identityConfidence: numeric(account.identity_confidence),
    canonicalAccountId: account.canonical_account_id
      ? String(account.canonical_account_id)
      : null,
    canonicalAccountName: account.canonical_account_id
      ? accountNames.get(String(account.canonical_account_id)) ??
        "Linked account"
      : null,
    lastUpdatedAt: isoInstant(
      account.last_file_import_at ?? account.updated_at
    ),
  }));

  const signals: TruthTransactionSignal[] = transactions
    .filter(
      (transaction) =>
        transaction.duplicate_of_transaction_id || transaction.detected_transfer
    )
    .slice(0, 150)
    .map((transaction) => ({
      id: String(transaction.id),
      postedAt: isoDate(transaction.posted_at),
      merchant: String(transaction.merchant),
      normalizedMerchant: String(
        transaction.normalized_merchant ?? normalizeMerchant(transaction.merchant)
      ),
      accountName: transaction.account_id
        ? accountNames.get(String(transaction.account_id)) ?? "Account"
        : "Unassigned",
      amount: numeric(transaction.amount_cents) / 100,
      source: String(transaction.source ?? "manual"),
      signal: transaction.duplicate_of_transaction_id
        ? "duplicate"
        : "transfer",
      confidence: numeric(transaction.truth_confidence),
      duplicateOfId: transaction.duplicate_of_transaction_id
        ? String(transaction.duplicate_of_transaction_id)
        : null,
      transferGroupId: transaction.transfer_group_id
        ? String(transaction.transfer_group_id)
        : null,
      duplicateReviewStatus: (transaction.duplicate_review_status ??
        "unreviewed") as TruthTransactionSignal["duplicateReviewStatus"],
      transferReviewStatus: (transaction.transfer_review_status ??
        "unreviewed") as TruthTransactionSignal["transferReviewStatus"],
    }));

  const transferCandidates: TruthTransferCandidate[] = transactions
    .filter(
      (transaction) =>
        transaction.account_id &&
        !transaction.duplicate_of_transaction_id &&
        transaction.transfer_review_status !== "confirmed" &&
        !transaction.detected_transfer
    )
    .slice(0, 60)
    .map((transaction) => ({
      id: String(transaction.id),
      postedAt: isoDate(transaction.posted_at),
      merchant: String(
        transaction.normalized_merchant ?? transaction.merchant
      ),
      accountId: String(transaction.account_id),
      accountName:
        accountNames.get(String(transaction.account_id)) ?? "Account",
      amount: numeric(transaction.amount_cents) / 100,
    }));

  const checked = [
    ...accounts.map((account) => isoInstant(account.truth_checked_at)),
    ...transactions.map((transaction) => isoInstant(transaction.truth_checked_at)),
  ]
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    summary: {
      accountsScanned: accountHealth.filter((account) => account.isActive).length,
      duplicateAccountCandidates: accountHealth.filter(
        (account) =>
          account.isActive && account.status === "duplicate_candidate"
      ).length,
      staleAccounts: accountHealth.filter(
        (account) => account.isActive && account.status === "stale"
      ).length,
      transactionsScanned: transactions.length,
      normalizedTransactions: transactions.filter(
        (transaction) => transaction.normalized_merchant
      ).length,
      duplicateTransactions: transactions.filter(
        (transaction) => transaction.duplicate_of_transaction_id
      ).length,
      detectedTransfers: new Set(
        transactions
          .filter(
            (transaction) =>
              transaction.detected_transfer && transaction.transfer_group_id
          )
          .map((transaction) => String(transaction.transfer_group_id))
      ).size,
      lastRunAt: checked.at(-1) ?? null,
    },
    accounts: accountHealth,
    signals,
    transferCandidates,
    merchantRules: rules.map((rule) => ({
      id: String(rule.id),
      matchMerchant: String(rule.match_merchant),
      normalizedMerchant: rule.normalized_merchant
        ? String(rule.normalized_merchant)
        : null,
      category: rule.category ? String(rule.category) : null,
      priority: numeric(rule.priority),
    })),
    mergeAudits: mergeAudits.map((audit) => ({
      id: String(audit.id),
      duplicateAccountName:
        accountNames.get(String(audit.duplicate_account_id)) ?? "Merged account",
      canonicalAccountName:
        accountNames.get(String(audit.canonical_account_id)) ??
        "Canonical account",
      movedTransactions: numeric(audit.moved_transaction_count),
      reassignedHoldings: numeric(audit.reassigned_holding_count),
      suppressedHoldings: numeric(audit.suppressed_holding_count),
      createdAt: isoInstant(audit.created_at),
    })),
  };
}
