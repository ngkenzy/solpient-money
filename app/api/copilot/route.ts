import { NextResponse } from "next/server";
import {
  answerMoneyQuestion,
  buildLocalModelSystemPrompt,
  getMoneyCopilotContext,
} from "@/lib/money-copilot";
import { getOllamaStatus, runOllamaChat } from "@/lib/ollama";

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

    const context = await getMoneyCopilotContext();
    const deterministic = answerMoneyQuestion(question, context);
    const status = await getOllamaStatus();

    if (deterministic.matched) {
      return NextResponse.json({
        answer: deterministic.answer,
        facts: deterministic.facts,
        calculation: deterministic.calculation,
        intent: deterministic.intent,
        engine: "deterministic",
        model: null,
        localModelAvailable: status.available,
        localModel: status.model,
      });
    }

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
