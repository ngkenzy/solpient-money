"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CommandPalette from "./CommandPalette";
import ThemeToggle from "./ThemeToggle";
import {
  Activity,
  BrainCircuit,
  BriefcaseBusiness,
  CircleDollarSign,
  Goal,
  Home,
  Landmark,
  ListChecks,
  PlugZap,
  List,
  Settings,
  ShieldCheck,
  Wallet,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const sections: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { href: "/", label: "Overview", icon: Home },
      { href: "/accounts", label: "Accounts", icon: WalletCards },
      { href: "/connect", label: "Connect", icon: PlugZap },
      { href: "/transactions", label: "Transactions", icon: List },
      { href: "/cash-flow", label: "Cash Flow", icon: CircleDollarSign },
    ],
  },
  {
    label: "INVEST",
    items: [
      { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
      { href: "/portfolio-intelligence", label: "Portfolio Intelligence", icon: BrainCircuit },
      { href: "/tsp", label: "Thrift Saving Plan", icon: Landmark },
    ],
  },
  {
    label: "BUDGETING",
    items: [
      { href: "/budget", label: "Budget", icon: Wallet },
      { href: "/plan", label: "Financial Plan", icon: ListChecks },
      { href: "/monitor", label: "Plan Monitor", icon: Activity },
      { href: "/goals", label: "Goals", icon: Goal },
    ],
  },
  {
    label: "DATA",
    items: [
      { href: "/data-health", label: "Data Health", icon: ShieldCheck },
      { href: "/data", label: "Data", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <div className="brand-name">SOLPIENT</div>
          <div className="brand-subtitle">YOUR FINANCIAL INTELLIGENCE</div>
        </Link>

        <nav className="side-nav" aria-label="Primary">
          {sections.map((section, sectionIndex) => (
            <div key={section.label ?? "overview"}>
              {sectionIndex > 0 ? <div className="nav-divider" /> : null}
              {section.label ? <div className="nav-label">{section.label}</div> : null}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    className={"side-item" + (active ? " active" : "")}
                    href={item.href}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <CommandPalette />

        <div className="sidebar-theme">
          <ThemeToggle />
        </div>

        <div className="sidebar-footer">
          <div className="mountain-mark" />
          <p>A CLEARER<br />FINANCIAL FUTURE</p>
        </div>
      </aside>

      <section className="workspace">
        {children}
      </section>
    </main>
  );
}
