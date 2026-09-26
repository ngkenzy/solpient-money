import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, HandCoins, TriangleAlert } from "lucide-react";
import AllocationExplorer from "@/components/AllocationExplorer";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import RefreshPricesButton from "./RefreshPricesButton";
import RefreshIncomeValueButton from "./RefreshIncomeValueButton";
import { getPortfolioMetrics, money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import {
  aggregateHoldingsByTicker,
  buildPortfolioIntelligence,
} from "@/lib/portfolio-intelligence";
import {
  DIVIDEND_SOURCE_LABEL,
  frequencyLabel,
  getDividendIntelligence,
} from "@/lib/dividends";
import { VALUE_SOURCE_LABEL } from "@/lib/value-proxies";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const metrics = getPortfolioMetrics(data);
  const portfolioIntelligence = buildPortfolioIntelligence(data);
  const holdings = aggregateHoldingsByTicker(data.holdings);
  const dividendIntel = await getDividendIntelligence(holdings);
  let recurringBillsMonthly: number | null = null;
  if (dividendIntel.payerCount > 0) {
    try {
      const cashFlow = await getCashFlowIntelligence();
      recurringBillsMonthly =
        cashFlow.health.recurringBillsMonthly > 0
          ? cashFlow.health.recurringBillsMonthly
          : null;
    } catch {
      recurringBillsMonthly = null;
    }
  }
  const dividendCoveragePct =
    recurringBillsMonthly != null && recurringBillsMonthly > 0
      ? (dividendIntel.monthlyAverage / recurringBillsMonthly) * 100
      : null;
  const maxDivMonth = Math.max(
    1,
    ...dividendIntel.months.map((m) => m.declared + m.projected)
  );
  const dividendUpdatedLabel = dividendIntel.fetchedAt
    ? new Date(dividendIntel.fetchedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  const homeAccount = data.accounts.find((a) => a.type === "property") ?? null;
  const mortgageAccount =
    data.accounts.find((a) => a.type === "debt" && /mortgage|home\s*loan/i.test(a.name)) ?? null;
  const homeEquity =
    homeAccount != null
      ? homeAccount.balance - Math.abs(mortgageAccount?.balance ?? 0)
      : null;
  const safeHomeEquity = Math.max(0, homeEquity ?? 0);
  const combinedWealth = metrics.total + safeHomeEquity;
  const investablePct = combinedWealth > 0 ? (metrics.total / combinedWealth) * 100 : 0;
  const homePct = combinedWealth > 0 ? (safeHomeEquity / combinedWealth) * 100 : 0;
  const bySector = Object.entries(
    data.holdings.reduce<Record<string, number>>((acc, holding) => {
      acc[holding.sector] = (acc[holding.sector] ?? 0) + holding.value;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  if (!data.holdings.length) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="PORTFOLIO"
          title="Your investments."
          description="Persisted household holdings with deterministic exposure review."
        />
        <EmptyState
          icon={BriefcaseBusiness}
          title="No holdings yet"
          copy="Import a brokerage CSV or add your first holding to see allocation, performance, and exposure review."
          actionHref="/connect"
          actionLabel="Import holdings"
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PORTFOLIO"
        title="Your investments."
        description={context.source === "database" ? "Persisted household holdings with deterministic exposure review." : "Demo holdings with deterministic exposure review until Money persistence is connected."}
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Portfolio value</span><strong>{money(metrics.total)}</strong><small>{data.holdings.length} holdings</small></div>
        <div className="metric-card"><span>Largest position</span><strong>{portfolioIntelligence.largestStockWeightPct.toFixed(1)}%</strong><small>Of invested assets</small></div>
        <div className="metric-card"><span>Top-three weight</span><strong>{portfolioIntelligence.topThreeStockWeightPct.toFixed(1)}%</strong><small>Review line {data.householdPlan.topThreeStockReviewPct}%</small></div>
        <div className="metric-card"><span>Positions flagged</span><strong>{portfolioIntelligence.watchCount + portfolioIntelligence.criticalCount}</strong><small>Concentration review</small></div>
      </div>

      <section className="card page-card" id="allocation">
          <div className="section-title-row">
            <div><span className="card-kicker">ALLOCATION</span><h2>Asset mix</h2></div>
            <span className="small-muted">Select a class to see its positions</span>
          </div>
          <AllocationExplorer items={data.allocation} holdings={holdings} total={metrics.total} />
          <div className="alloc-exposures">
            <div className="section-title-row">
              <div><span className="card-kicker">EXPOSURES</span><h2>By sector / sleeve</h2></div>
            </div>
            <div className="bar-grid two-col">
              {bySector.map(([sector, value]) => {
                const weight = metrics.total ? (value / metrics.total) * 100 : 0;
                return (
                  <div className="bar-item" key={sector}>
                    <div><span>{sector}</span><strong>{weight.toFixed(1)}% · {money(value)}</strong></div>
                    <div className="bar-track"><span style={{ width: `${weight}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      <section className="card page-card" id="dividends">
        <div className="section-title-row">
          <div><span className="card-kicker">DIVIDENDS</span><h2>Income calendar</h2></div>
          <div className="holdings-header-actions">
            {dividendUpdatedLabel ? (
              <span className="small-muted">Updated {dividendUpdatedLabel}</span>
            ) : null}
            {context.source === "database" ? <RefreshIncomeValueButton /> : null}
          </div>
        </div>
        {dividendIntel.payerCount === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No dividend data yet"
            copy="Refresh dividends & value to pull declared payouts for every holding and build your 12-month income calendar automatically."
          />
        ) : (
          <>
            <div className="metric-grid four">
              <div className="metric-card"><span>Annual income</span><strong>{money(dividendIntel.annualIncome)}</strong><small>Next 12 months, projected</small></div>
              <div className="metric-card"><span>Portfolio yield</span><strong>{dividendIntel.portfolioYieldPct != null ? `${dividendIntel.portfolioYieldPct.toFixed(2)}%` : "—"}</strong><small>On invested assets</small></div>
              <div className="metric-card"><span>Monthly average</span><strong>{money(dividendIntel.monthlyAverage)}</strong><small>Across the next year</small></div>
              <div className="metric-card"><span>Dividend payers</span><strong>{dividendIntel.payerCount}</strong><small>Holdings paying out</small></div>
            </div>
            {dividendCoveragePct != null ? (
              <p className="div-coverage">
                Your dividends average <strong>{money(dividendIntel.monthlyAverage)}/mo</strong>, covering{" "}
                <strong>{dividendCoveragePct.toFixed(0)}%</strong>{" "}
                of your <strong>{money(recurringBillsMonthly ?? 0)}/mo</strong> in recurring bills.
              </p>
            ) : null}
            <div className="div-calendar" role="img" aria-label="Projected dividend income by month">
              {dividendIntel.months.map((month) => {
                const total = month.declared + month.projected;
                const declaredPct = total > 0 ? (month.declared / maxDivMonth) * 100 : 0;
                const projectedPct = total > 0 ? (month.projected / maxDivMonth) * 100 : 0;
                return (
                  <div className="div-bar-group" key={month.monthKey} title={`${month.label}: ${money(total)}${month.declared > 0 ? ` (${money(month.declared)} declared)` : ""}`}>
                    <div className="div-bar">
                      <span className="div-bar-projected" style={{ height: `${projectedPct}%` }} />
                      <span className="div-bar-declared" style={{ height: `${declaredPct}%` }} />
                    </div>
                    <small>{month.label}</small>
                  </div>
                );
              })}
            </div>
            <div className="div-legend">
              <span><i className="div-swatch declared" /> Declared</span>
              <span><i className="div-swatch projected" /> Projected</span>
            </div>
            {dividendIntel.upcoming.length > 0 ? (
              <div className="div-upcoming">
                <h3>Upcoming payments</h3>
                <div className="data-table div-upcoming-table">
                  <div className="table-row table-head-row">
                    <span>Holding</span><span>Ex-date</span><span>Pay date</span><span>Amount</span>
                  </div>
                  {dividendIntel.upcoming.map((item, index) => (
                    <div className="table-row" key={`${item.ticker}-${item.payDate}-${index}`}>
                      <span className="holding-name"><strong>{item.ticker}</strong></span>
                      <span>{item.exDate}</span>
                      <span>{item.payDate}</span>
                      <span><strong>{money(item.amount)}</strong> <em className={item.declared ? "div-badge declared" : "div-badge projected"}>{item.declared ? "Declared" : "Projected"}</em></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="div-payers">
              <h3>Your payers</h3>
              <div className="data-table div-table">
                <div className="table-row table-head-row">
                  <span>Payer</span><span>Annual income</span><span>Yield</span><span>Next payment</span>
                </div>
                {dividendIntel.payers.map((payer) => (
                  <div className="table-row" key={payer.ticker}>
                    <span className="holding-name">
                      <strong>{payer.ticker}</strong>
                      <small>{frequencyLabel(payer.frequency)} · {money(payer.annualPerShare)}/share</small>
                    </span>
                    <span><strong>{money(payer.annualIncome)}</strong></span>
                    <span>{payer.yieldPct != null ? `${payer.yieldPct.toFixed(2)}%` : "—"}</span>
                    <span>{payer.nextPayDate ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="small-muted div-footnote">
              Declared payments were announced by the company; projected ones follow each payer's payout pattern.
              Sources: {DIVIDEND_SOURCE_LABEL} dividends, {VALUE_SOURCE_LABEL} market data.
            </p>
          </>
        )}
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">HOLDINGS</span><h2>Positions</h2></div>
          <div className="holdings-header-actions">
            <span className="small-muted">Click a holding for position detail</span>
            {context.source === "database" ? <RefreshPricesButton /> : null}
          </div>
        </div>
        <div className="data-table holdings-table v03">
          <div className="table-row table-head-row">
            <span>Holding</span><span>Value</span><span>Weight</span><span>YTD</span>
          </div>
          {holdings.map((holding) => {
            const weight = metrics.total ? (holding.value / metrics.total) * 100 : 0;
            return (
              <Link className="table-row table-link" href={`/portfolio/${holding.ticker.toLowerCase()}`} key={holding.ticker}>
                <span className="holding-name">
                  <strong>{holding.ticker}</strong>
                  <small>
                    {holding.name}
                    {holding.source === "file" ? <em className="source-badge file-import">FILE IMPORT</em> : null}
                  </small>
                </span>
                <strong>{money(holding.value)}</strong>
                <span>{weight.toFixed(1)}%</span>
                <span className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">PORTFOLIO INTELLIGENCE</span><h2>Exposure review</h2></div>
          <Link className="text-button" href="/portfolio-intelligence">Open intelligence <ArrowRight size={15} /></Link>
        </div>
        <div className="insight-grid">
          {portfolioIntelligence.signals.slice(0, 4).map((signal) => (
            <div
              className={
                "insight-item " +
                (signal.level === "positive" ? "good" : "watch")
              }
              key={signal.id}
            >
              {signal.level === "positive" ? (
                <CheckCircle2 size={20} />
              ) : (
                <TriangleAlert size={20} />
              )}
              <div>
                <strong>{signal.title}</strong>
                <p>{signal.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {homeEquity !== null ? (
        <section className="card page-card">
          <div className="section-title-row">
            <div><span className="card-kicker">BIGGER PICTURE</span><h2>Total wealth</h2></div>
            <span className="small-muted">Investable assets + home equity</span>
          </div>
          <div
            className="wealth-bar"
            role="img"
            aria-label={`Investable assets ${money(metrics.total)}, home equity ${money(homeEquity)}`}
          >
            <span className="wealth-segment wealth-investable" style={{ width: `${investablePct}%` }} />
            <span className="wealth-segment wealth-home" style={{ width: `${homePct}%` }} />
          </div>
          <div className="wealth-legend">
            <div>
              <span className="wealth-dot wealth-investable-dot" />
              <div><strong>Investable assets</strong><span>{money(metrics.total)} · {investablePct.toFixed(1)}%</span></div>
            </div>
            <div>
              <span className="wealth-dot wealth-home-dot" />
              <div><strong>Home equity</strong><span>{money(homeEquity)} · {homePct.toFixed(1)}%</span></div>
            </div>
            <div className="wealth-total"><strong>Combined</strong><strong>{money(combinedWealth)}</strong></div>
          </div>
          <p className="small-muted">The allocation above stays investable-only — your home is counted here and in your net worth on the Overview.</p>
        </section>
      ) : null}
    </div>
  );
}
