import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ResearchCandidate = {
  rank: number;
  ticker: string;
  detail: string;
};

export type FundResearchFeed = {
  state: "not-connected" | "unavailable" | "research-pending" | "published";
  lastUpdated: string | null;
  focus: string[];
  candidates: ResearchCandidate[];
};

/**
 * Read-only bridge to the private local Git clone. No GitHub token, remote
 * request, credential storage or repo writes. Never cache private notes in
 * a static build: callers must be dynamically rendered server components.
 */
export async function getFundResearchFeed(): Promise<FundResearchFeed> {
  const root = process.env.SOLPIENT_FUND_REPO_DIR?.trim();
  const disconnected: FundResearchFeed = {
    state: root ? "unavailable" : "not-connected",
    lastUpdated: null,
    focus: [],
    candidates: [],
  };
  if (!root) return disconnected;

  let direction: string;
  let canonical: string;
  try {
    [direction, canonical] = await Promise.all([
      readFile(join(root, "DIRECTION.md"), "utf8"),
      readFile(join(root, "recommendations/top-10/CURRENT.md"), "utf8"),
    ]);
  } catch {
    return disconnected;
  }

  const updated = direction.match(/\*\*Last updated:\*\*\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const focusSection = direction.split(/^## This week's focus\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const focus = focusSection.split(/\r?\n/)
    .filter((line) => /^-\s+/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/^-\s+/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*/g, "").trim().slice(0, 280));

  const section = canonical.split(/^## Canonical Top 10\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const candidates: ResearchCandidate[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (candidates.length >= 10) break;
    const columns = line.trim().split("|").map((column) => column.trim()).filter(Boolean);
    if (columns.length < 3 || !/^\d{1,2}$/.test(columns[0])) continue;
    const rank = Number(columns[0]);
    const ticker = columns[1].replace(/\*\*/g, "").toUpperCase();
    if (rank < 1 || rank > 10 || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) continue;
    candidates.push({ rank, ticker, detail: columns.slice(2, 4).join(" · ").slice(0, 180) });
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const explicitlyPending = /not published yet|research in progress/i.test(section + "\n" + canonical.slice(0, 280));

  return {
    state: !explicitlyPending && candidates.length > 0 ? "published" : "research-pending",
    lastUpdated: updated,
    focus,
    candidates: explicitlyPending ? [] : candidates,
  };
}
