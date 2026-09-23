import Link from "next/link";
import {
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  RotateCcw,
  ShieldAlert,
  TimerReset,
} from "lucide-react";
import { getMoneyActionCenter } from "@/lib/money-action-center";
import {
  reopenAction,
  resolveAction,
  reviewAction,
  snoozeAction,
} from "./actions";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  if (status === "new") return "New";
  if (status === "reviewed") return "Reviewed";
  if (status === "snoozed") return "Snoozed";
  return "Resolved";
}

function portfolioTicker(sourceKey: string) {
  const match = sourceKey.match(
    /^portfolio:([^:]+):/
  );
  return match?.[1]?.toUpperCase() ?? null;
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const hours = Math.round(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function ItemCard({
  item,
}: {
  item: Awaited<ReturnType<typeof getMoneyActionCenter>>["items"][number];
}) {
  return (
    <article className={`action-item action-${item.severity}`}>
      <div className="action-severity-icon">
        {item.severity === "critical" ? (
          <ShieldAlert size={18} />
        ) : (
          <CircleAlert size={18} />
        )}
      </div>

      <div className="action-item-copy">
        <div className="action-item-title-row">
          <strong>{item.title}</strong>
          <span className={`action-status action-status-${item.status}`}>
            {statusLabel(item.status)}
          </span>
        </div>
        <p>{item.detail}</p>
        <div className="action-item-meta">
          <span>{item.category.replace("_", " ")}</span>
          <span>Seen {relativeTime(item.lastSeenAt)}</span>
          {item.snoozedUntil ? (
            <span>
              Snoozed until{" "}
              {new Date(item.snoozedUntil).toLocaleString("en-US")}
            </span>
          ) : null}
          {item.resolutionReason === "condition_cleared" ? (
            <span>Condition cleared automatically</span>
          ) : null}
        </div>
      </div>

      <div className="action-item-controls">
        <Link href={item.href} className="action-open-link">
          Open source <ChevronRight size={14} />
        </Link>

        {item.category === "portfolio" && portfolioTicker(item.sourceKey) ? (
          <Link
            className="action-open-link"
            href={`/decision-journal?ticker=${portfolioTicker(item.sourceKey)}&actionItemId=${item.id}`}
          >
            <BookOpenCheck size={13} />
            Record decision
          </Link>
        ) : null}

        {item.status === "resolved" ? (
          <form action={reopenAction}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit">
              <RotateCcw size={13} />
              Reopen
            </button>
          </form>
        ) : (
          <>
            {item.status !== "reviewed" ? (
              <form action={reviewAction}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit">
                  <Eye size={13} />
                  Mark reviewed
                </button>
              </form>
            ) : null}

            <form action={snoozeAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="days" value="1" />
              <button type="submit">
                <Clock3 size={13} />
                Snooze 1 day
              </button>
            </form>

            <form action={resolveAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit">
                <CheckCircle2 size={13} />
                Resolve
              </button>
            </form>
          </>
        )}
      </div>
    </article>
  );
}

export default async function ActionCenterPage() {
  const center = await getMoneyActionCenter();

  const active = center.items.filter(
    (item) =>
      item.status !== "resolved" &&
      item.status !== "snoozed"
  );
  const snoozed = center.items.filter(
    (item) => item.status === "snoozed"
  );
  const resolved = center.items
    .filter((item) => item.status === "resolved")
    .slice(0, 20);

  return (
    <div className="dashboard action-center-page">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            V1.4 · ACTION CENTER
            <span className="demo-pill persistent">HUMAN REVIEW</span>
          </div>
          <h1>Turn signals into decisions.</h1>
          <p>
            Material Autopilot findings persist here until you review,
            snooze, resolve, or the underlying condition clears.
          </p>
        </div>
        <div className="asof">
          <strong>{center.counts.totalOpen} open</strong>
          <span>{center.counts.critical} critical · {center.counts.watch} watch</span>
        </div>
      </div>

      <div className="action-metric-grid">
        <section className="card action-metric">
          <BellRing size={18} />
          <span>New</span>
          <strong>{center.counts.new}</strong>
          <small>Needs first review</small>
        </section>
        <section className="card action-metric">
          <Eye size={18} />
          <span>Reviewed</span>
          <strong>{center.counts.reviewed}</strong>
          <small>Seen, condition still active</small>
        </section>
        <section className="card action-metric">
          <TimerReset size={18} />
          <span>Snoozed</span>
          <strong>{center.counts.snoozed}</strong>
          <small>Temporarily hidden</small>
        </section>
        <section className="card action-metric">
          <CheckCircle2 size={18} />
          <span>Resolved</span>
          <strong>{center.counts.resolved}</strong>
          <small>Closed or condition cleared</small>
        </section>
      </div>

      <section className="card action-center-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">NEEDS ATTENTION</span>
            <h2>Active decisions</h2>
          </div>
          <span className="action-count-pill">{active.length}</span>
        </div>

        {active.length ? (
          <div className="action-item-list">
            {active.map((item) => (
              <ItemCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <div className="action-empty">
            <CheckCircle2 size={24} />
            <strong>No active Action Center items.</strong>
            <span>
              Autopilot will add material issues here when they appear.
            </span>
          </div>
        )}
      </section>

      {snoozed.length ? (
        <section className="card action-center-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">SNOOZED</span>
              <h2>Deferred review</h2>
            </div>
            <span className="action-count-pill">{snoozed.length}</span>
          </div>
          <div className="action-item-list">
            {snoozed.map((item) => (
              <ItemCard item={item} key={item.id} />
            ))}
          </div>
        </section>
      ) : null}

      {resolved.length ? (
        <section className="card action-center-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">RECENT HISTORY</span>
              <h2>Resolved items</h2>
            </div>
            <span className="action-count-pill">{resolved.length}</span>
          </div>
          <div className="action-item-list resolved">
            {resolved.map((item) => (
              <ItemCard item={item} key={item.id} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="bottom-note">
        <BellRing size={15} />
        <span>
          Action Center status changes are workflow acknowledgements only.
          They never transfer money, place trades, pay bills, or modify your
          financial plan.
        </span>
      </div>
    </div>
  );
}
