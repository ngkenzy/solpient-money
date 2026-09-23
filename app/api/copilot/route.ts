import { NextResponse } from "next/server";
import {
  answerMoneyQuestion,
  buildLocalModelSystemPrompt,
  getMoneyCopilotContext,
} from "@/lib/money-copilot";
import { getOllamaStatus, runOllamaChat } from "@/lib/ollama";
import { getPlanMonitoring } from "@/lib/plan-monitor-engine";
import { getMoneyAutopilotBriefing } from "@/lib/money-autopilot";
import { buildPortfolioIntelligence } from "@/lib/portfolio-intelligence";
import { requireMoneyDataset } from "@/lib/money-data";
import { loadResearchSnapshots } from "@/lib/research";
import { getDecisionChange, getDecisionJournal } from "@/lib/portfolio-history";
import { getTspTracker } from "@/lib/tsp-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientMessage = {
  role?: unknown;
  content?: unknown;
};

function safeMessages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-8)
    .map((message): { role: "user" | "assistant"; content: string } | null => {
      const item = message as ClientMessage;
      const role =
        item.role === "assistant"
          ? "assistant"
          : item.role === "user"
            ? "user"
            : null;
      const content = String(item.content ?? "").trim().slice(0, 3000);

      return role && content ? { role, content } : null;
    })
    .filter(
      (
        message
      ): message is { role: "user" | "assistant"; content: string } =>
        Boolean(message)
    );
}

export async function GET() {
  const status = await getOllamaStatus();

  return NextResponse.json({
    available: status.available,
    model: status.model,
    models: status.models.map((model) => ({
      name: model.name,
      size: model.size ?? null,
    })),
    error: status.error,
    deterministicAvailable: true,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: unknown;
      messages?: unknown;
      model?: unknown;
    };

    const question = String(body.question ?? "").trim().slice(0, 3000);

    if (!question) {
      return NextResponse.json(
        { error: "Ask a financial question first." },
        { status: 400 }
      );
    }

    if (
      /\btsp\b|thrift savings|brs match|max.*tsp|tsp.*max|g fund|c fund|s fund|i fund|f fund/i.test(
        question
      )
    ) {
      const tracker =
        await getTspTracker();

      if (!tracker.profile) {
        return NextResponse.json({
          answer:
            "Military TSP Tracker is available, but the local TSP profile is not configured yet. Open Military TSP and enter retirement system, service entry date, basic pay, and your Traditional/Roth contribution percentages.",
          facts: [],
          calculation:
            "V1.7 uses dated 2026 IRS contribution limits and BRS contribution rules against your locally entered TSP profile and snapshots.",
          intent: "tsp_tracker",
          engine: "deterministic",
          model: null,
        });
      }

      const top = tracker.signals.find(
        (signal) =>
          signal.level === "critical" ||
          signal.level === "watch"
      );

      return NextResponse.json({
        answer: top
          ? `${top.title}. ${top.detail}`
          : "V1.7 does not detect a material issue in the current TSP contribution pace, BRS match threshold, annual limit, or saved fund allocation.",
        facts: [
          {
            label: "TSP balance",
            value:
              tracker.snapshot == null
                ? "—"
                : new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(
                    tracker.snapshot.totalBalance
                  ),
          },
          {
            label: "Member contribution",
            value: `${tracker.totalContributionPct.toFixed(
              1
            )}% of basic pay`,
          },
          {
            label: "2026 employee limit",
            value: new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(
              tracker.employeeAnnualLimit
            ),
          },
          {
            label: "Remaining employee limit",
            value: new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(
              tracker.remainingEmployeeLimit
            ),
          },
          {
            label: "BRS service contribution",
            value: `${tracker.brsGovernmentPct.toFixed(
              1
            )}% of basic pay`,
          },
        ],
        calculation:
          "Traditional + Roth basic-pay election, year-to-date TSP employee contributions, entered outside-plan elective deferrals, 2026 IRS limit/catch-up rules, and BRS automatic/matching eligibility.",
        intent: "tsp_tracker",
        engine: "deterministic",
        model: null,
      });
    }

    if (
      /last decision|decision journal|since my decision|since i decided|what changed since.*decision/i.test(
        question
      )
    ) {
      const moneyContext =
        await requireMoneyDataset();
      const ownedTickers =
        moneyContext.dataset.holdings
          .filter(
            (holding) =>
              holding.kind === "stock"
          )
          .map(
            (holding) =>
              holding.ticker.toUpperCase()
          );

      const questionTokens = new Set(
        question
          .toUpperCase()
          .split(/[^A-Z0-9.-]+/)
          .filter(Boolean)
      );
      const explicitTicker =
        ownedTickers.find(
          (ticker) =>
            questionTokens.has(ticker)
        ) ?? null;

      const decisions =
        explicitTicker
          ? []
          : await getDecisionJournal(1);
      const ticker =
        explicitTicker ??
        decisions[0]?.ticker ??
        null;

      if (!ticker) {
        return NextResponse.json({
          answer:
            "No V1.6 investment decision has been recorded yet. Open Decision Journal to create the first decision-time baseline.",
          facts: [],
          calculation:
            "V1.6 compares the latest position/Research snapshot with the snapshot attached to your latest recorded decision.",
          intent: "decision_history",
          engine: "deterministic",
          model: null,
        });
      }

      const change =
        await getDecisionChange(
          ticker
        );

      const signed = (
        value: number | null,
        suffix = "%"
      ) =>
        value == null
          ? "—"
          : `${value >= 0 ? "+" : ""}${value.toFixed(
              1
            )}${suffix}`;

      return NextResponse.json({
        answer: change.summary,
        facts: [
          {
            label: "Ticker",
            value: ticker,
          },
          {
            label: "Last decision",
            value:
              change.decision?.decisionType.replaceAll(
                "_",
                " "
              ) ?? "None",
          },
          {
            label: "Price change",
            value: signed(
              change.priceChangePct
            ),
          },
          {
            label: "Weight change",
            value: signed(
              change.weightChangePctPoints,
              " pts"
            ),
          },
          {
            label: "Evidence change",
            value:
              change.evidenceChange == null
                ? "—"
                : `${change.evidenceChange >= 0 ? "+" : ""}${change.evidenceChange.toFixed(
                    0
                  )}`,
          },
        ],
        calculation:
          "Latest V1.6 daily position/Research snapshot compared with the exact snapshot attached to your latest human-authored investment decision.",
        intent: "decision_history",
        engine: "deterministic",
        model: null,
      });
    }

    if (
      /portfolio intelligence|which holdings need review|which stocks need review|portfolio risk|portfolio concentration|research conflict|thesis risk|valuation conflict/i.test(
        question
      )
    ) {
      const moneyContext =
        await requireMoneyDataset();
      const tickers = moneyContext.dataset.holdings
        .filter((holding) => holding.kind === "stock")
        .map((holding) => holding.ticker);
      const research =
        await loadResearchSnapshots(tickers);
      const report =
        buildPortfolioIntelligence(
          moneyContext.dataset,
          research
        );
      const top = report.signals.find(
        (signal) =>
          signal.level === "critical" ||
          signal.level === "watch"
      );
      const topPosition =
        report.positions[0];

      return NextResponse.json({
        answer: top
          ? `V1.5 shows ${report.criticalCount} critical and ${report.watchCount} review item(s). ${top.title}. ${top.detail}`
          : "V1.5 does not detect a material conflict between current portfolio exposure and the available published Research evidence.",
        facts: [
          {
            label: "Research coverage",
            value: `${report.coveragePct.toFixed(0)}%`,
          },
          {
            label: "Top-three weight",
            value: `${report.topThreeStockWeightPct.toFixed(1)}%`,
          },
          {
            label: "Highest review priority",
            value: topPosition
              ? `${topPosition.ticker} · ${topPosition.reviewPriority}`
              : "—",
          },
          {
            label: "Evidence confidence",
            value:
              report.weightedEvidenceConfidence == null
                ? "—"
                : `${report.weightedEvidenceConfidence.toFixed(0)}/100`,
          },
        ],
        calculation:
          "Position size and household concentration thresholds combined with published Research thesis health, base valuation, evidence confidence, decision readiness, and evidence age. Review priority is not a buy/sell score.",
        intent: "portfolio_intelligence",
        engine: "deterministic",
        model: null,
      });
    }

    if (
      /daily briefing|money autopilot|autopilot|what changed since yesterday|what changed today|since yesterday|overnight financial|what needs my attention today/i.test(
        question
      )
    ) {
      const briefing =
        await getMoneyAutopilotBriefing();

      const currency = (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(value);

      const top = briefing.alerts[0];

      return NextResponse.json({
        answer:
          `${briefing.summary} ${top?.title ?? ""} ${top?.detail ?? ""}`.trim(),
        facts: [
          {
            label: "Net worth",
            value: currency(briefing.snapshot.netWorth),
          },
          {
            label: "Financial health",
            value: `${briefing.snapshot.healthScore}/100`,
          },
          {
            label: "Plan alignment",
            value: `${briefing.snapshot.planAlignment}/100`,
          },
          {
            label: "New transactions",
            value: String(briefing.newTransactionCount),
          },
        ],
        calculation:
          "Persisted daily Money Autopilot snapshot compared with the prior daily snapshot, plus connector freshness, deterministic cash-flow anomaly checks, and V1.2 plan drift.",
        intent: "money_autopilot",
        engine: "deterministic",
        model: null,
      });
    }

    if (
      /what changed|plan drift|plan monitor|off plan|on track with.*plan|deviation|behind plan|ahead of plan/i.test(
        question
      )
    ) {
      const monitor = await getPlanMonitoring(new Date(), {
        createBaseline: false,
      });
      const top = monitor.signals[0];
      const currency = (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(value);

      return NextResponse.json({
        answer: monitor.baselinePersisted
          ? monitor.materialSignalCount > 0
            ? `V1.2 currently shows ${monitor.materialSignalCount} material plan change(s). ${top?.title ?? "Open Plan Monitor for the full comparison."} ${top?.detail ?? ""}`
            : "V1.2 does not detect material drift from the saved monthly plan baseline."
          : "There is no saved V1.2 monthly baseline yet. Open Plan Monitor once to capture the current monthly reference point; Copilot will not create or reset it because the Copilot remains read-only.",
        facts: [
          {
            label: "Plan alignment",
            value: `${monitor.alignmentScore}/100`,
          },
          {
            label: "Projected spending",
            value: currency(monitor.pace.spending.projectedMonthEnd),
          },
          {
            label: "Projected surplus",
            value: currency(monitor.pace.surplus.projectedMonthEnd),
          },
        ],
        calculation:
          "Saved monthly V1.1 baseline compared with reconciled month-to-date cash flow and current plan timing.",
        intent: "plan_monitoring",
        engine: "deterministic",
        model: null,
      });
    }

    const context = await getMoneyCopilotContext();
    const deterministic = answerMoneyQuestion(question, context);

    if (deterministic.matched) {
      return NextResponse.json({
        answer: deterministic.answer,
        facts: deterministic.facts,
        calculation: deterministic.calculation,
        intent: deterministic.intent,
        engine: "deterministic",
        model: null,
      });
    }

    const status = await getOllamaStatus();

    if (status.available) {
      const history = safeMessages(body.messages);
      const requestedModel = String(body.model ?? "").trim() || status.model;

      const local = await runOllamaChat({
        system: buildLocalModelSystemPrompt(context),
        messages: [
          ...history,
          { role: "user", content: question },
        ],
        model: requestedModel,
      });

      return NextResponse.json({
        answer: local.content,
        facts: [
          {
            label: "Financial health",
            value: `${context.healthScore}/100`,
          },
          {
            label: "Net worth",
            value: new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(context.netWorth),
          },
        ],
        calculation: null,
        intent: "local_ai",
        engine: "ollama",
        model: local.model,
        localModelAvailable: true,
        localModel: local.model,
      });
    }

    return NextResponse.json({
      answer: deterministic.answer,
      facts: [
        {
          label: "Financial health",
          value: `${context.healthScore}/100`,
        },
        {
          label: "Emergency reserve",
          value: `${context.emergencyFundMonths.toFixed(1)} months`,
        },
        {
          label: "Savings rate",
          value: `${context.trailingSavingsRate.toFixed(1)}%`,
        },
      ],
      calculation: deterministic.calculation,
      intent: deterministic.intent,
      engine: "deterministic",
      model: null,
      localModelAvailable: false,
      localModel: null,
      localModelError: status.error,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to answer the question.",
      },
      { status: 500 }
    );
  }
}
