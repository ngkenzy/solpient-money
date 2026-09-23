"use client";

import Link from "next/link";
import AutopilotDailyRunner from "@/components/AutopilotDailyRunner";
import ActionCenterNavBadge from "@/components/ActionCenterNavBadge";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Goal,
  Gauge,
  ListChecks,
  Home,
  LineChart,
  Landmark,
  PlugZap,
  List,
  PiggyBank,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
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
      { href: "/decision-journal", label: "Decision Journal", icon: BookOpenCheck },
      { href: "/performance", label: "Performance", icon: LineChart },
      { href: "/allocation", label: "Allocation", icon: BarChart3 },
      { href: "/tsp", label: "Military TSP", icon: Landmark },
    ],
  },
  {
    label: "PLAN",
    items: [
      { href: "/plan", label: "Financial Plan", icon: ListChecks },
      { href: "/monitor", label: "Plan Monitor", icon: Activity },
      { href: "/retirement", label: "Retirement", icon: PiggyBank },
      { href: "/goals", label: "Goals", icon: Goal },
      { href: "/debt", label: "Debt", icon: CreditCard },
      { href: "/scenario-lab", label: "Scenario Lab", icon: SlidersHorizontal },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { href: "/action-center", label: "Action Center", icon: BellRing },
      { href: "/autopilot", label: "Autopilot", icon: Radar },
      { href: "/copilot", label: "Money Copilot", icon: Bot },
      { href: "/health", label: "Financial Health", icon: Gauge },
      { href: "/insights", label: "Insights", icon: BrainCircuit, badge: "3" },
      { href: "/research", label: "Research", icon: Building2 },
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
                    {item.href === "/action-center" ? <ActionCenterNavBadge /> : item.badge ? <span className="side-badge">{item.badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="mountain-mark" />
          <p>A CLEARER<br />FINANCIAL FUTURE</p>
        </div>
      </aside>

      <section className="workspace">
        <AutopilotDailyRunner />
        <header className="topbar">
          <div className="topbar-product-group">
            <div className="product-switch">
              <Link href="/research">Research</Link>
              <Link className={pathname === "/research" ? "" : "selected"} href="/">Money</Link>
            </div>
            <span className="global-sandbox-badge">LOCAL POSTGRES · MONEY V1.8.0</span>
          </div>

          <div className="top-actions">
            <div className="searchbox" aria-label="Global search placeholder">
              <Search size={16} />
              <span>Search...</span>
            </div>
            <Link
              className="icon-button"
              aria-label="Open Action Center"
              href="/action-center"
            >
              <Bell size={18} />
            </Link>
            <div className="profile">
              <span className="avatar">SM</span>
              <span>Money Household</span>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
