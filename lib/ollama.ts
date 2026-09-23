import "server-only";

export type OllamaModel = {
  name: string;
  size?: number;
  modifiedAt?: string | null;
};

export type OllamaStatus = {
  available: boolean;
  baseUrl: string;
  model: string | null;
  models: OllamaModel[];
  error: string | null;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    size?: number;
    modified_at?: string;
  }>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

function baseUrl() {
  return String(process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 1600
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const url = baseUrl();

  try {
    const response = await fetchWithTimeout(`${url}/api/tags`);

    if (!response.ok) {
      return {
        available: false,
        baseUrl: url,
        model: null,
        models: [],
        error: `Ollama returned HTTP ${response.status}.`,
      };
    }

    const body = (await response.json()) as OllamaTagsResponse;
    const models = (body.models ?? [])
      .map((model) => ({
        name: String(model.name ?? "").trim(),
        size: Number.isFinite(Number(model.size))
          ? Number(model.size)
          : undefined,
        modifiedAt: model.modified_at ?? null,
      }))
      .filter((model) => Boolean(model.name));

    const requested = String(process.env.OLLAMA_MODEL ?? "").trim();
    const selected =
      (requested &&
        models.find(
          (model) =>
            model.name === requested ||
            model.name.startsWith(`${requested}:`)
        )?.name) ||
      models[0]?.name ||
      null;

    return {
      available: Boolean(selected),
      baseUrl: url,
      model: selected,
      models,
      error: selected
        ? null
        : "Ollama is running, but no local models are installed.",
    };
  } catch (error) {
    return {
      available: false,
      baseUrl: url,
      model: null,
      models: [],
      error:
        error instanceof Error
          ? error.name === "AbortError"
            ? "Ollama did not respond before the local timeout."
            : error.message
          : "Unable to reach Ollama.",
    };
  }
}

export async function runOllamaChat({
  system,
  messages,
  model,
}: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string | null;
}) {
  const status = await getOllamaStatus();
  const selectedModel = model || status.model;

  if (!status.available || !selectedModel) {
    throw new Error(status.error ?? "No local Ollama model is available.");
  }

  const response = await fetchWithTimeout(
    `${status.baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        stream: false,
        messages: [
          { role: "system", content: system },
          ...messages.slice(-8),
        ],
        options: {
          temperature: 0.2,
        },
      }),
    },
    60000
  );

  if (!response.ok) {
    throw new Error(
      `Ollama chat failed with HTTP ${response.status}.`
    );
  }

  const body = (await response.json()) as {
    message?: { content?: string };
  };

  const content = String(body.message?.content ?? "").trim();

  if (!content) {
    throw new Error("The local model returned an empty response.");
  }

  return {
    model: selectedModel,
    content,
  };
}
