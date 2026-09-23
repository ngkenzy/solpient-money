import { readFile } from "node:fs/promises";

const files = {
  ollama: await readFile("lib/ollama.ts", "utf8"),
  copilot: await readFile("lib/money-copilot.ts", "utf8"),
  route: await readFile("app/api/copilot/route.ts", "utf8"),
  component: await readFile("components/MoneyCopilot.tsx", "utf8"),
  page: await readFile("app/copilot/page.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  home: await readFile("app/page.tsx", "utf8"),
};

const writeTokens = [".insert(", ".update(", ".delete(", ".rpc("];
const copilotPath = [
  files.copilot,
  files.route,
  files.ollama,
].join("\n");
const postRoute = files.route.slice(
  files.route.indexOf("export async function POST")
);

const checks = [
  ["deterministic context exists", files.copilot.includes("getMoneyCopilotContext")],
  ["deterministic answers exist", files.copilot.includes("answerMoneyQuestion")],
  ["common answers do not require Ollama", postRoute.indexOf("deterministic.matched") < postRoute.indexOf("const status = await getOllamaStatus()")],
  ["Ollama defaults to localhost", files.ollama.includes("http://127.0.0.1:11434")],
  ["Ollama is optional", files.route.includes("localModelAvailable: false")],
  ["Copilot route has no financial writes", !writeTokens.some((token) => copilotPath.includes(token))],
  ["Copilot context excludes account last-four", !files.copilot.includes("lastFour") && !files.copilot.includes("last_four")],
  ["Copilot context excludes database secrets", !files.copilot.includes("DATABASE_URL") && !files.route.includes("DATABASE_URL")],
  ["system prompt enforces read-only", files.copilot.includes("You are read-only")],
  ["forecast is available to Copilot", files.copilot.includes("forecast12MonthNetWorth")],
  ["financial health is available to Copilot", files.copilot.includes("healthScore")],
  ["local model status endpoint exists", files.route.includes("export async function GET")],
  ["Copilot UI distinguishes engines", files.component.includes("Deterministic Solpient") && files.component.includes("Local AI")],
  ["conversation is not persisted in browser storage", !files.component.includes("localStorage") && !files.component.includes("sessionStorage")],
  ["Copilot page exists", files.page.includes("LOCAL MONEY COPILOT")],
  ["Copilot is navigable", files.shell.includes('href: "/copilot"')],
  ["Overview routes to Copilot", files.home.includes('href="/copilot"')],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.0 Local Money Copilot invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.0 Local Money Copilot invariants passed.");
