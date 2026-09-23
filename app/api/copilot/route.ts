import { NextResponse } from "next/server";
import {
  answerMoneyQuestion,
  buildLocalModelSystemPrompt,
  getMoneyCopilotContext,
} from "@/lib/money-copilot";
import { getOllamaStatus, runOllamaChat } from "@/lib/ollama";
import { getPlanMonitoring } from "@/lib/plan-monitor-engine";
import { getMoneyAutopilotBriefing } from "@/lib/money-autopilot";

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
