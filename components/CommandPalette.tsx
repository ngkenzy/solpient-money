"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  BriefcaseBusiness,
  CircleDollarSign,
  Download,
  Goal,
  Home,
  Landmark,
  List,
  ListChecks,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  Upload,
  Wallet,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type PaletteItem = {
  label: string;
  hint: string;
  href: string;
  keywords: string;
  icon: LucideIcon;
  section: string;
};

// Mirrors the AppShell nav plus deep-link actions. Keep in sync when nav changes.
const ITEMS: PaletteItem[] = [
  { label: "Overview", hint: "Dashboard", href: "/", keywords: "home dashboard net worth", icon: Home, section: "Pages" },
  { label: "Accounts", hint: "Balances", href: "/accounts", keywords: "balances banks brokerage", icon: WalletCards, section: "Pages" },
  { label: "Connect", hint: "Import", href: "/connect", keywords: "import upload csv qfx ofx files vanguard", icon: PlugZap, section: "Pages" },
  { label: "Transactions", hint: "Activity", href: "/transactions", keywords: "activity spending history search", icon: List, section: "Pages" },
  { label: "Cash Flow", hint: "Income vs spending", href: "/cash-flow", keywords: "income spending bills radar recurring", icon: CircleDollarSign, section: "Pages" },
  { label: "Portfolio", hint: "Holdings", href: "/portfolio", keywords: "stocks holdings investments positions refresh prices", icon: BriefcaseBusiness, section: "Pages" },
  { label: "Portfolio Intelligence", hint: "Analysis", href: "/portfolio-intelligence", keywords: "analysis diversification concentration", icon: BrainCircuit, section: "Pages" },
  { label: "Thrift Saving Plan", hint: "TSP", href: "/tsp", keywords: "tsp thrift savings plan g fund f fund c fund s fund i fund federal", icon: Landmark, section: "Pages" },
  { label: "Budget", hint: "Monthly", href: "/budget", keywords: "monthly budget categories envelopes spending plan", icon: Wallet, section: "Pages" },
  { label: "Financial Plan", hint: "Waterfall", href: "/plan", keywords: "plan waterfall steps priorities", icon: ListChecks, section: "Pages" },
  { label: "Plan Monitor", hint: "Tracking", href: "/monitor", keywords: "monitor tracking progress alerts", icon: Activity, section: "Pages" },
  { label: "Goals", hint: "Targets", href: "/goals", keywords: "goals targets savings", icon: Goal, section: "Pages" },
  { label: "Data Health", hint: "Quality", href: "/data-health", keywords: "health quality duplicates issues", icon: ShieldCheck, section: "Pages" },
  { label: "Data", hint: "Backup & settings", href: "/data", keywords: "data backup restore settings import actions", icon: Settings, section: "Pages" },
  { label: "Import a file", hint: "Connect", href: "/connect", keywords: "upload csv qfx ofx import file bank brokerage", icon: Upload, section: "Actions" },
  { label: "Refresh market prices", hint: "Portfolio", href: "/portfolio", keywords: "prices refresh yahoo quote update", icon: TrendingUp, section: "Actions" },
  { label: "Pull TSP prices", hint: "TSP", href: "/tsp", keywords: "tsp prices pull update funds", icon: RefreshCw, section: "Actions" },
  { label: "Download backup", hint: "Data", href: "/data", keywords: "backup download export encrypted restore", icon: Download, section: "Actions" },
];

function matches(item: PaletteItem, query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (!needle) return true;
  const hay = `${item.label} ${item.hint} ${item.keywords} ${item.section}`.toLowerCase();
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return false;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = "";
    };
  }, [open ]);

  const filtered = useMemo(() => ITEMS.filter((item) => matches(item, query)), [query]);
  const safeActive = Math.min(active, Math.max(0, filtered.length - 1));

  const go = (item: PaletteItem) => {
    setOpen(false);
    router.push(item.href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const item = filtered[safeActive];
      if (item) go(item);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  let lastSection = "";
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

  return (
    <>
      <button
        type="button"
        className="cmdk-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
      >
        <Search size={15} />
        <span>Jump to…</span>
        <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {open ? (
        <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
          <div
            className="cmdk-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cmdk-input-row">
              <Search size={17} />
              <input
                ref={inputRef}
                className="cmdk-input"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Type a page or action…"
                aria-label="Search pages and actions"
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-list"
                aria-activedescendant={filtered[safeActive] ? `cmdk-item-${safeActive}` : undefined}
              />
              <kbd>esc</kbd>
            </div>
            <div className="cmdk-list" id="cmdk-list" role="listbox">
              {filtered.length === 0 ? (
                <div className="cmdk-empty">No matches. Try “budget”, “tsp”, or “import”.</div>
              ) : (
                filtered.map((item, index) => {
                  const Icon = item.icon;
                  const header =
                    item.section !== lastSection ? (
                      <div className="cmdk-section-label" key={`section-${item.section}`}>
                        {item.section}
                      </div>
                    ) : null;
                  lastSection = item.section;
                  return (
                    <div key={`${item.section}-${item.label}`}>
                      {header}
                      <button
                        type="button"
                        id={`cmdk-item-${index}`}
                        role="option"
                        aria-selected={index === safeActive}
                        className={"cmdk-item" + (index === safeActive ? " active" : "")}
                        onMouseMove={() => setActive(index)}
                        onClick={() => go(item)}
                      >
                        <span className="cmdk-item-icon">
                          <Icon size={16} />
                        </span>
                        <span className="cmdk-item-text">
                          <strong>{item.label}</strong>
                          <span>{item.hint}</span>
                        </span>
                        <span className="cmdk-go">↵</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="cmdk-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
