"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Calculator,
  CheckCircle2,
  CircleOff,
  Cpu,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Fact = {
  label: string;
  value: string;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  engine?: "deterministic" | "ollama";
  model?: string | null;
  facts?: Fact[];
  calculation?: string | null;
};

type Status = {
  available: boolean;
  model: string | null;
  models: Array<{ name: string; size: number | null }>;
  error: string | null;
  deterministicAvailable: boolean;
};

const QUICK_PROMPTS = [
  "How should I allocate my monthly surplus?",
  "What is my net worth?",
  "How strong is my emergency fund?",
  "Where is my money going?",
  "How much high-interest debt do I have?",
  "Am I on track for retirement?",
  "What does my 12-month forecast show?",
];

function engineLabel(message: Message) {
  if (message.engine === "ollama") {
    return message.model ? `Local AI · ${message.model}` : "Local AI";
  }

  if (message.engine === "deterministic") {
    return "Deterministic Solpient";
  }

  return null;
}

export default function MoneyCopilot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Ask me about net worth, cash flow, emergency reserves, debt, recurring bills, portfolio concentration, retirement progress, financial health, or your 12-month forecast.",
      engine: "deterministic",
    },
  ]);
  const [status, setStatus] = useState<Status | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/copilot", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Status) => {
        if (cancelled) return;
        setStatus(data);
        setSelectedModel(data.model ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({
          available: false,
          model: null,
          models: [],
          error: "Unable to check the local model.",
          deterministicAvailable: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const conversationPayload = useMemo(
    () =>
      messages
        .filter((message) => message.id !== 1)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    [messages]
  );

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = {
      id: nextId.current++,
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          messages: conversationPayload,
          model: selectedModel || null,
        }),
      });

      const body = (await response.json()) as {
        answer?: string;
        facts?: Fact[];
        calculation?: string | null;
        engine?: "deterministic" | "ollama";
        model?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to answer the question.");
      }

      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          content: body.answer ?? "No answer returned.",
          engine: body.engine ?? "deterministic",
          model: body.model ?? null,
          facts: body.facts ?? [],
          calculation: body.calculation ?? null,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to answer the question.",
          engine: "deterministic",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function clearConversation() {
    setMessages([
      {
        id: nextId.current++,
        role: "assistant",
        content:
          "Conversation cleared. Household calculations remain unchanged and read-only.",
        engine: "deterministic",
      },
    ]);
  }

  return (
    <div className="copilot-layout">
      <aside className="card copilot-side">
        <div className="copilot-status-head">
          <span className="copilot-side-icon">
            <Bot size={20} />
          </span>
          <div>
            <span className="card-kicker">ENGINE STATUS</span>
            <h2>Local-first</h2>
          </div>
        </div>

        <div className="copilot-engine-row">
          <span className="copilot-engine-icon ready">
            <Calculator size={15} />
          </span>
          <div>
            <strong>Deterministic Solpient</strong>
            <span>Always available</span>
          </div>
          <CheckCircle2 size={14} />
        </div>

        <div className="copilot-engine-row">
          <span
            className={
              "copilot-engine-icon " + (status?.available ? "ready" : "offline")
            }
          >
            <Cpu size={15} />
          </span>
          <div>
            <strong>Local Ollama</strong>
            <span>
              {!status
                ? "Checking..."
                : status.available
                  ? status.model
                  : "Optional · offline"}
            </span>
          </div>
          {status?.available ? (
            <CheckCircle2 size={14} />
          ) : (
            <CircleOff size={14} />
          )}
        </div>

        {status && status.models.length > 1 ? (
          <label className="copilot-model-select">
            <span>Local model</span>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {status.models.map((model) => (
                <option value={model.name} key={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="copilot-boundary">
          <ShieldCheck size={16} />
          <div>
            <strong>Read-only boundary</strong>
            <span>
              The Copilot can explain Solpient data but cannot edit accounts,
              move money, place trades, or write to PostgreSQL.
            </span>
          </div>
        </div>

        {!status?.available ? (
          <div className="copilot-offline-note">
            <strong>Local AI is optional.</strong>
            <span>
              Deterministic financial questions work now. Start Ollama and
              install a local model later for broader conversational explanations.
            </span>
          </div>
        ) : null}

        <button className="copilot-clear" type="button" onClick={clearConversation}>
          <RotateCcw size={13} />
          Clear conversation
        </button>
      </aside>

      <section className="card copilot-chat">
        <div className="copilot-chat-head">
          <div>
            <span className="card-kicker">ASK SOLPIENT</span>
            <h2>Household financial copilot</h2>
          </div>
          <span className="copilot-private-pill">
            <ShieldCheck size={12} />
            Local financial context
          </span>
        </div>

        <div className="copilot-quick-prompts">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              type="button"
              key={prompt}
              onClick={() => void ask(prompt)}
              disabled={loading}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="copilot-thread">
          {messages.map((message) => {
            const label = engineLabel(message);

            return (
              <article
                className={"copilot-message " + message.role}
                key={message.id}
              >
                <div className="copilot-message-avatar">
                  {message.role === "assistant" ? (
                    <Sparkles size={15} />
                  ) : (
                    <span>YOU</span>
                  )}
                </div>
                <div className="copilot-message-body">
                  {label ? <span className="copilot-engine-label">{label}</span> : null}
                  <p>{message.content}</p>

                  {message.facts?.length ? (
                    <div className="copilot-fact-grid">
                      {message.facts.map((fact) => (
                        <div key={`${message.id}-${fact.label}`}>
                          <span>{fact.label}</span>
                          <strong>{fact.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.calculation ? (
                    <details className="copilot-calculation">
                      <summary>Show calculation</summary>
                      <span>{message.calculation}</span>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}

          {loading ? (
            <article className="copilot-message assistant">
              <div className="copilot-message-avatar">
                <Sparkles size={15} />
              </div>
              <div className="copilot-message-body">
                <span className="copilot-engine-label">Solpient</span>
                <div className="copilot-thinking">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>
          ) : null}
          <div ref={endRef} />
        </div>

        <form className="copilot-composer" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your finances..."
            maxLength={3000}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            <Send size={16} />
          </button>
        </form>

        <div className="copilot-disclaimer">
          <ShieldCheck size={13} />
          <span>
            Deterministic calculations come from reconciled Solpient Money data.
            Local-model explanations may still make mistakes; verify important
            decisions against the underlying calculations.
          </span>
        </div>
      </section>
    </div>
  );
}
