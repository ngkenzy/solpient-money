"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";
import {
  parseOfficialTspCsv,
  TSP_OFFICIAL_CSV_VERSION,
  type TspOfficialFundRow,
} from "@/lib/tsp-official-csv";
import { syncTspSharePrices } from "@/lib/tsp-prices";

export type TspCsvImportState = {
  ok: boolean;
  message: string;
};

export type TspFundPriceState = {
  ok: boolean;
  message: string;
};

const TSP_CSV_MAX_BYTES = 2 * 1024 * 1024;

function cents(value: number) {
  return Math.round(value * 100);
}

function tspHoldingKind(
  fund: TspOfficialFundRow
): "stock" | "etf" | "bond" | "cash" {
  const asset = fund.assetClass.toLowerCase();

  if (asset.includes("cash") || fund.fundCode === "G") {
    return "cash";
  }

  if (
    asset.includes("bond") ||
    asset.includes("fixed") ||
    fund.fundCode === "F"
  ) {
    return "bond";
  }

  return "etf";
}

function tspHoldingSector(
  fund: TspOfficialFundRow
) {
  if (fund.fundCode === "I") return "International";
  if (fund.fundCode === "G") return "Cash";
  if (fund.fundCode === "F") return "Bonds";
  if (
    fund.fundCode === "C" ||
    fund.fundCode === "S"
  ) {
    return "U.S. Equities";
  }
  return "Mixed";
}

function holdingFingerprint(
  statementEnd: string,
  fund: TspOfficialFundRow
) {
  return createHash("sha256")
    .update(
      [
        TSP_OFFICIAL_CSV_VERSION,
        statementEnd,
        fund.fundCode,
        fund.units,
        fund.fundPrice,
        fund.closingBalance,
      ].join("|")
    )
    .digest("hex");
}

export async function importOfficialTspCsv(
  _previousState: TspCsvImportState,
  formData: FormData
): Promise<TspCsvImportState> {
  try {
    const upload = formData.get("tspCsv");

    if (!(upload instanceof File)) {
      return {
        ok: false,
        message: "Choose the CSV exported from TSP.gov.",
      };
    }

    if (upload.size <= 0) {
      return {
        ok: false,
        message: "The selected TSP CSV is empty.",
      };
    }

    if (upload.size > TSP_CSV_MAX_BYTES) {
      return {
        ok: false,
        message: "The TSP CSV must be 2 MB or smaller.",
      };
    }

    if (
      !upload.name.toLowerCase().endsWith(".csv")
    ) {
      return {
        ok: false,
        message: "Choose a .csv file exported from TSP.gov.",
      };
    }

    const bytes = new Uint8Array(
      await upload.arrayBuffer()
    );

    let source = "";
    try {
      source = new TextDecoder("utf-8", {
        fatal: true,
      }).decode(bytes);
    } catch {
      return {
        ok: false,
        message: "The TSP CSV must be valid UTF-8 text.",
      };
    }

    const statement =
      parseOfficialTspCsv(source);
    const digest = createHash("sha256")
      .update(bytes)
      .digest("hex");

    const liveImportTotalCents =
      statement.funds.reduce(
        (sum, fund) =>
          sum +
          cents(
            fund.units * fund.fundPrice
          ),
        0
      );
    const liveImportTotal =
      liveImportTotalCents / 100;

    const { database, householdId } =
      await requireActiveHousehold();

    let { data: account, error: accountError } =
      await database
        .from("accounts")
        .select(
          "id,name,institution,account_type,source"
        )
        .eq("household_id", householdId)
        .eq("name", statement.plan)
        .eq("account_type", "retirement")
        .or("source.eq.manual,source.eq.file")
        .limit(1)
        .maybeSingle();

    if (accountError) {
      throw new Error(
        `Unable to find TSP retirement account: ${accountError.message}`
      );
    }

    if (!account) {
      const fallback =
        await database
          .from("accounts")
          .select(
            "id,name,institution,account_type,source"
          )
          .eq("household_id", householdId)
          .eq(
            "institution",
            "Thrift Savings Plan"
          )
          .eq("account_type", "retirement")
          .or("source.eq.manual,source.eq.file")
          .limit(1)
          .maybeSingle();

      if (fallback.error) {
        throw new Error(
          `Unable to find prior TSP account: ${fallback.error.message}`
        );
      }

      account = fallback.data;
    }

    const now = new Date().toISOString();

    if (!account) {
      const created = await database
        .from("accounts")
        .insert({
          household_id: householdId,
          name: statement.plan,
          institution: "Thrift Savings Plan",
          account_type: "retirement",
          balance_cents: liveImportTotalCents,
          owner_scope: "Household",
          last_four: null,
          source: "file",
          sort_order: 300,
          last_file_import_at: now,
        })
        .select(
          "id,name,institution,account_type,source"
        )
        .single();

      if (created.error || !created.data) {
        throw new Error(
          `Unable to create TSP retirement account: ${created.error?.message ?? "No account returned."}`
        );
      }

      account = created.data;
    } else {
      const updated = await database
        .from("accounts")
        .update({
          name: statement.plan,
          institution: "Thrift Savings Plan",
          account_type: "retirement",
          balance_cents: liveImportTotalCents,
          source: "file",
          last_file_import_at: now,
          updated_at: now,
        })
        .eq("id", account.id)
        .eq("household_id", householdId);

      if (updated.error) {
        throw new Error(
          `Unable to update TSP retirement account: ${updated.error.message}`
        );
      }
    }

    const accountId = String(account.id);

    const existingHoldings =
      await database
        .from("holdings")
        .select("ticker")
        .eq("household_id", householdId)
        .eq("account_id", accountId);

    if (existingHoldings.error) {
      throw new Error(
        `Unable to inspect current TSP holdings: ${existingHoldings.error.message}`
      );
    }

    const holdingRows =
      statement.funds.map((fund) => ({
        household_id: householdId,
        account_id: accountId,
        ticker: `TSP-${fund.fundCode}`,
        name: fund.fundName,
        holding_kind: tspHoldingKind(fund),
        shares: fund.units,
        price: fund.fundPrice,
        cost_basis_cents: 0,
        market_value_cents: cents(
          fund.units * fund.fundPrice
        ),
        day_change_pct: 0,
        ytd_return_pct:
          fund.periodStart ===
          `${fund.periodEnd.slice(0, 4)}-01-01`
            ? fund.fundReturnPct
            : 0,
        sector: tspHoldingSector(fund),
        source: "file",
        import_fingerprint:
          holdingFingerprint(
            statement.periodEnd,
            fund
          ),
      }));

    const upserted = await database
      .from("holdings")
      .upsert(holdingRows, {
        onConflict:
          "household_id,account_id,ticker",
      });

    if (upserted.error) {
      throw new Error(
        `Unable to update TSP holdings: ${upserted.error.message}`
      );
    }

    const currentTickers = new Set(
      holdingRows.map((row) => row.ticker)
    );

    const staleTickers = (
      existingHoldings.data ?? []
    )
      .map((row) =>
        String(row.ticker).toUpperCase()
      )
      .filter(
        (ticker) =>
          ticker.startsWith("TSP-") &&
          !currentTickers.has(ticker)
      );

    if (staleTickers.length) {
      const removed = await database
        .from("holdings")
        .delete()
        .eq("household_id", householdId)
        .eq("account_id", accountId)
        .in("ticker", staleTickers);

      if (removed.error) {
        throw new Error(
          `Unable to remove stale TSP holdings: ${removed.error.message}`
        );
      }
    }

    const prior = await database
      .from("tsp_statement_imports")
      .select("id")
      .eq("household_id", householdId)
      .eq(
        "source_content_sha256",
        digest
      )
      .eq(
        "parser_version",
        TSP_OFFICIAL_CSV_VERSION
      )
      .limit(1)
      .maybeSingle();

    if (prior.error) {
      throw new Error(
        `Unable to check TSP import history: ${prior.error.message}`
      );
    }

    if (!prior.data) {
      const audit = await database
        .from("tsp_statement_imports")
        .insert({
          household_id: householdId,
          source_kind: "csv",
          source_filename:
            upload.name.slice(0, 240),
          source_content_sha256: digest,
          source_size_bytes: bytes.byteLength,
          parser_version:
            TSP_OFFICIAL_CSV_VERSION,
          parsed_statement_date:
            statement.periodEnd,
          parsed_candidate: statement,
          parser_warnings:
            JSON.stringify(
              statement.warnings.map(
                (message) => ({
                  code: "tsp_csv_warning",
                  field: null,
                  message,
                })
              )
            ),
          parser_errors: JSON.stringify([]),
          validation_state: "confirmed",
          confirmed_at: now,
        });

      if (audit.error) {
        throw new Error(
          `Unable to save TSP import history: ${audit.error.message}`
        );
      }
    }

    for (const path of [
      "/tsp",
      "/",
      "/accounts",
      "/portfolio",
      "/allocation",
      "/health",
    ]) {
      revalidatePath(path);
    }

    return {
      ok: true,
      message:
        `Imported ${statement.funds.length} TSP funds. ` +
        `The live ${liveImportTotal.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: "USD",
          }
        )} value (units × fund price) is now included in Investments and Net Worth.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to import the TSP CSV.",
    };
  }
}

export async function updateTspFundPrice(
  _previousState: TspFundPriceState,
  formData: FormData
): Promise<TspFundPriceState> {
  try {
    const ticker = String(
      formData.get("ticker") ?? ""
    )
      .trim()
      .toUpperCase();

    const rawPrice = String(
      formData.get("fundPrice") ?? ""
    )
      .trim()
      .replace(/^\$/, "")
      .replace(/,/g, "");

    const price = Number(rawPrice);

    if (
      !ticker.startsWith("TSP-") ||
      ticker.length > 80
    ) {
      return {
        ok: false,
        message: "Invalid imported TSP fund.",
      };
    }

    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 1_000_000
    ) {
      return {
        ok: false,
        message: "Enter a valid fund price greater than $0.",
      };
    }

    const { database, householdId } =
      await requireActiveHousehold();

    const holdingResult = await database
      .from("holdings")
      .select(
        "id,account_id,ticker,name,shares,price,market_value_cents,source"
      )
      .eq("household_id", householdId)
      .eq("ticker", ticker)
      .eq("source", "file")
      .limit(1)
      .maybeSingle();

    if (
      holdingResult.error ||
      !holdingResult.data
    ) {
      return {
        ok: false,
        message: "Imported TSP fund not found.",
      };
    }

    const holding = holdingResult.data;
    const accountId = String(
      holding.account_id ?? ""
    );

    if (!accountId) {
      return {
        ok: false,
        message: "This TSP fund is not linked to an account.",
      };
    }

    const accountResult = await database
      .from("accounts")
      .select(
        "id,institution,account_type,source"
      )
      .eq("id", accountId)
      .eq("household_id", householdId)
      .single();

    if (
      accountResult.error ||
      !accountResult.data ||
      String(accountResult.data.institution) !==
        "Thrift Savings Plan" ||
      String(accountResult.data.account_type) !==
        "retirement"
    ) {
      return {
        ok: false,
        message: "This holding is not part of the Thrift Saving Plan account.",
      };
    }

    const shares = Number(
      holding.shares ?? 0
    );

    if (!Number.isFinite(shares) || shares < 0) {
      return {
        ok: false,
        message: "The imported unit count is invalid.",
      };
    }

    const now = new Date().toISOString();
    const newValue = shares * price;

    const holdingUpdate = await database
      .from("holdings")
      .update({
        price,
        market_value_cents: cents(newValue),
        updated_at: now,
      })
      .eq("id", holding.id)
      .eq("household_id", householdId);

    if (holdingUpdate.error) {
      throw new Error(
        `Unable to update fund price: ${holdingUpdate.error.message}`
      );
    }

    const portfolioResult = await database
      .from("holdings")
      .select("market_value_cents")
      .eq("household_id", householdId)
      .eq("account_id", accountId);

    if (portfolioResult.error) {
      throw new Error(
        `Unable to recalculate TSP value: ${portfolioResult.error.message}`
      );
    }

    const totalCents = (
      portfolioResult.data ?? []
    ).reduce(
      (sum, row) =>
        sum +
        Number(row.market_value_cents ?? 0),
      0
    );

    const accountUpdate = await database
      .from("accounts")
      .update({
        balance_cents: Math.round(totalCents),
        updated_at: now,
      })
      .eq("id", accountId)
      .eq("household_id", householdId);

    if (accountUpdate.error) {
      throw new Error(
        `Unable to update TSP account value: ${accountUpdate.error.message}`
      );
    }

    for (const path of [
      "/tsp",
      "/",
      "/accounts",
      "/portfolio",
      "/allocation",
      "/health",
    ]) {
      revalidatePath(path);
    }

    return {
      ok: true,
      message:
        `${String(holding.name)} updated to ${price.toFixed(6)}. ` +
        `Fund value is now ${newValue.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update the fund price.",
    };
  }
}

function dollarsToCents(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function percent(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function optionalInt(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function saveTspProfile(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const retirementSystem = String(
    formData.get("retirementSystem") ?? "unknown"
  );
  const serviceComponent = String(
    formData.get("serviceComponent") ?? "active"
  );

  const { error } = await supabase
    .from("tsp_profiles")
    .upsert(
      {
        household_id: householdId,
        linked_account_id: null,
        retirement_system: ["brs", "legacy", "unknown"].includes(
          retirementSystem
        )
          ? retirementSystem
          : "unknown",
        service_component: ["active", "reserve", "guard", "other"].includes(
          serviceComponent
        )
          ? serviceComponent
          : "other",
        service_entry_date: optionalDate(formData.get("serviceEntryDate")),
        age_at_year_end: optionalInt(formData.get("ageAtYearEnd")),
        annual_basic_pay_cents: dollarsToCents(
          formData.get("annualBasicPay")
        ),
        traditional_contribution_pct: percent(
          formData.get("traditionalContributionPct")
        ),
        roth_contribution_pct: percent(
          formData.get("rothContributionPct")
        ),
        external_deferrals_ytd_cents: dollarsToCents(
          formData.get("externalDeferralsYtd")
        ),
        prior_year_plan_wages_cents: dollarsToCents(
          formData.get("priorYearPlanWages")
        ),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id" }
    );

  if (error) {
    throw new Error(
      `Unable to save TSP profile: ${error.message}`
    );
  }

  revalidatePath("/tsp");
}

type FundRevisionInput = {
  fund_code: string;
  fund_name: string;
  balance_cents: number;
};

const CORE_FUNDS = [
  ["G", "Government Securities Investment Fund"],
  ["F", "Fixed Income Index Investment Fund"],
  ["C", "Common Stock Index Investment Fund"],
  ["S", "Small Capitalization Stock Index Investment Fund"],
  ["I", "International Stock Index Investment Fund"],
] as const;

export async function saveTspSnapshot(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const snapshotDate = String(
    formData.get("snapshotDate") ?? ""
  ).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    throw new Error("Enter a valid TSP snapshot date.");
  }

  const fundRows: FundRevisionInput[] = CORE_FUNDS.flatMap(([code, name]) => {
    const cents = dollarsToCents(formData.get(`fund${code}`));
    return cents > 0
      ? [
          {
            fund_code: code,
            fund_name: name,
            balance_cents: cents,
          },
        ]
      : [];
  });

  const lifecycleCode = String(
    formData.get("lifecycleCode") ?? ""
  )
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 24);
  const lifecycleCents = dollarsToCents(
    formData.get("lifecycleBalance")
  );

  if (lifecycleCode && lifecycleCents > 0) {
    fundRows.push({
      fund_code: lifecycleCode.startsWith("L")
        ? lifecycleCode.replaceAll(" ", "")
        : `L${lifecycleCode.replaceAll(" ", "")}`,
      fund_name: `Lifecycle Fund ${lifecycleCode}`,
      balance_cents: lifecycleCents,
    });
  }

  const {
    data: revisionRows,
    error: revisionError,
  } = await supabase.rpc(
    "insert_tsp_snapshot_revision",
    {
      p_household_id: householdId,
      p_snapshot_date: snapshotDate,
      p_traditional_balance_cents: dollarsToCents(
        formData.get("traditionalBalance")
      ),
      p_roth_balance_cents: dollarsToCents(
        formData.get("rothBalance")
      ),
      p_outstanding_loan_cents: dollarsToCents(
        formData.get("outstandingLoan")
      ),
      p_employee_contrib_ytd_cents: dollarsToCents(
        formData.get("employeeContribYtd")
      ),
      p_service_auto_ytd_cents: dollarsToCents(
        formData.get("serviceAutoYtd")
      ),
      p_service_match_ytd_cents: dollarsToCents(
        formData.get("serviceMatchYtd")
      ),
      p_note:
        String(formData.get("note") ?? "").trim().slice(0, 2000) || null,
      p_funds_json: JSON.stringify(fundRows),
    }
  );

  if (revisionError || !revisionRows?.[0]?.snapshot_id) {
    throw new Error(
      `Unable to save atomic TSP snapshot revision: ${revisionError?.message ?? "No snapshot revision returned."}`
    );
  }

  revalidatePath("/tsp");
}


export async function syncTspPricesNow() {
  const result = await syncTspSharePrices(
    new Date()
  );

  if (!result.ok) {
    throw new Error(
      result.warning ??
        "Unable to sync official TSP share prices."
    );
  }

  revalidatePath("/tsp");
  revalidatePath("/autopilot");
  revalidatePath("/action-center");
}
