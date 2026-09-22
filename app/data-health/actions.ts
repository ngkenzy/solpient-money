"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";
import {
  merchantRuleKey,
  normalizeMerchant,
  runTruthEngineForHousehold,
} from "@/lib/truth-engine";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/data-health");
  revalidatePath("/", "layout");
}

async function rerun() {
  await runTruthEngineForHousehold();
  refresh();
}

export async function runTruthEngine() {
  await rerun();
}

export async function reviewAccountDuplicate(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const accountId = text(formData, "account_id");
  const canonicalAccountId = text(formData, "canonical_account_id");
  const decision = text(formData, "decision");

  if (!accountId) throw new Error("Account is required.");

  if (decision === "confirm") {
    if (!canonicalAccountId) {
      throw new Error("Canonical account is required to confirm a merge.");
    }

    const { error } = await supabase.rpc("merge_truth_accounts", {
      p_duplicate_account_id: accountId,
      p_canonical_account_id: canonicalAccountId,
    });

    if (error) throw new Error(error.message);
  } else if (decision === "reject") {
    const { error } = await supabase
      .from("accounts")
      .update({
        identity_review_status: "not_duplicate",
        canonical_account_id: null,
        data_health_status: "healthy",
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("household_id", householdId);

    if (error) throw new Error(error.message);
  } else {
    throw new Error("Unknown account review decision.");
  }

  await rerun();
}

export async function reviewTransactionDuplicate(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const transactionId = text(formData, "transaction_id");
  const decision = text(formData, "decision");

  if (!transactionId) throw new Error("Transaction is required.");

  if (decision === "confirm") {
    const { data: transaction, error: readError } = await supabase
      .from("transactions")
      .select("id,duplicate_of_transaction_id")
      .eq("id", transactionId)
      .eq("household_id", householdId)
      .single();

    if (readError || !transaction?.duplicate_of_transaction_id) {
      throw new Error(
        readError?.message ?? "No duplicate target exists for this transaction."
      );
    }

    const { error } = await supabase
      .from("transactions")
      .update({
        duplicate_review_status: "confirmed",
        truth_confidence: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId)
      .eq("household_id", householdId);

    if (error) throw new Error(error.message);
  } else if (decision === "reject") {
    const { error } = await supabase
      .from("transactions")
      .update({
        duplicate_review_status: "rejected",
        duplicate_of_transaction_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId)
      .eq("household_id", householdId);

    if (error) throw new Error(error.message);
  } else {
    throw new Error("Unknown duplicate review decision.");
  }

  await rerun();
}

export async function reviewTransferGroup(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const transferGroupId = text(formData, "transfer_group_id");
  const decision = text(formData, "decision");

  if (!transferGroupId) throw new Error("Transfer group is required.");

  if (decision === "confirm") {
    const { error } = await supabase
      .from("transactions")
      .update({
        transfer_review_status: "confirmed",
        detected_transfer: true,
        truth_confidence: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("household_id", householdId)
      .eq("transfer_group_id", transferGroupId);

    if (error) throw new Error(error.message);
  } else if (decision === "reject") {
    const { error } = await supabase
      .from("transactions")
      .update({
        transfer_review_status: "rejected",
        detected_transfer: false,
        transfer_group_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("household_id", householdId)
      .eq("transfer_group_id", transferGroupId);

    if (error) throw new Error(error.message);
  } else {
    throw new Error("Unknown transfer review decision.");
  }

  await rerun();
}

export async function manuallyPairTransfer(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const firstId = text(formData, "first_transaction_id");
  const secondId = text(formData, "second_transaction_id");

  if (!firstId || !secondId || firstId === secondId) {
    throw new Error("Choose two different transactions.");
  }

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id,account_id,posted_at,amount_cents")
    .eq("household_id", householdId)
    .in("id", [firstId, secondId]);

  if (error) throw new Error(error.message);
  if (!rows || rows.length !== 2) {
    throw new Error("Both transactions must belong to this household.");
  }

  const [first, second] = rows;
  if (!first.account_id || !second.account_id) {
    throw new Error("Both transactions must be assigned to accounts.");
  }

  if (String(first.account_id) === String(second.account_id)) {
    throw new Error("A transfer must move between two different accounts.");
  }

  const firstAmount = Number(first.amount_cents);
  const secondAmount = Number(second.amount_cents);

  if (
    !Number.isFinite(firstAmount) ||
    !Number.isFinite(secondAmount) ||
    Math.round(firstAmount) + Math.round(secondAmount) !== 0
  ) {
    throw new Error("Transfer amounts must be equal and opposite.");
  }

  const firstDate = new Date(String(first.posted_at));
  const secondDate = new Date(String(second.posted_at));
  const distanceDays =
    Math.abs(firstDate.getTime() - secondDate.getTime()) / 86_400_000;

  if (!Number.isFinite(distanceDays) || distanceDays > 7) {
    throw new Error("Manual transfer pairs must be within seven days.");
  }

  const transferGroupId = randomUUID();
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      detected_transfer: true,
      transfer_group_id: transferGroupId,
      transfer_review_status: "confirmed",
      truth_confidence: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("household_id", householdId)
    .in("id", [firstId, secondId]);

  if (updateError) throw new Error(updateError.message);

  await rerun();
}

export async function createMerchantRule(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const rawMatch = text(formData, "match_merchant");
  const normalizedInput = text(formData, "normalized_merchant");
  const category = text(formData, "category");
  const priorityValue = Number(text(formData, "priority") || "100");

  if (!rawMatch) throw new Error("Merchant match is required.");

  const matchMerchant = merchantRuleKey(rawMatch);
  const normalizedMerchant = normalizedInput
    ? normalizeMerchant(normalizedInput)
    : normalizeMerchant(rawMatch);

  const { error } = await supabase
    .from("truth_merchant_rules")
    .upsert(
      {
        household_id: householdId,
        match_merchant: matchMerchant,
        normalized_merchant: normalizedMerchant,
        category: category || null,
        priority: Number.isFinite(priorityValue)
          ? Math.round(priorityValue)
          : 100,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,match_merchant" }
    );

  if (error) throw new Error(error.message);

  await rerun();
}

export async function deleteMerchantRule(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const ruleId = text(formData, "rule_id");

  if (!ruleId) throw new Error("Rule is required.");

  const { error } = await supabase
    .from("truth_merchant_rules")
    .delete()
    .eq("id", ruleId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  await rerun();
}
