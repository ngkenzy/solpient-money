import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import type { AttentionItem } from "@/lib/intelligence";

const icons = {
  critical: ShieldAlert,
  review: AlertTriangle,
  opportunity: Lightbulb,
  healthy: CheckCircle2,
};

export default function AttentionFeed({
  items,
  limit,
}: {
  items: AttentionItem[];
  limit?: number;
}) {
  const shown = typeof limit === "number" ? items.slice(0, limit) : items;

  return (
    <div className="attention-feed">
      {shown.map((item, index) => {
        const Icon = icons[item.category];
        return (
          <article className={"attention-item " + item.category} key={item.id}>
            <div className="attention-rank">{String(index + 1).padStart(2, "0")}</div>
            <span className="attention-icon"><Icon size={18} /></span>
            <div className="attention-content">
              <div className="attention-title-row">
                <div>
                  <span className={"attention-category " + item.category}>{item.category}</span>
                  <strong>{item.title}</strong>
                </div>
                {item.href ? (
                  <Link href={item.href} aria-label={`Open ${item.title}`}>
                    <ArrowRight size={16} />
                  </Link>
                ) : null}
              </div>
              <p>{item.detail}</p>
              <details className="explain-details">
                <summary>Why this appeared</summary>
                <div className="explain-grid">
                  <div><span>Why</span><p>{item.why}</p></div>
                  <div><span>Calculation</span><p>{item.calculation}</p></div>
                  <div className="explain-inputs">
                    <span>Inputs</span>
                    <ul>{item.inputs.map((input) => <li key={input}>{input}</li>)}</ul>
                  </div>
                </div>
              </details>
            </div>
          </article>
        );
      })}
    </div>
  );
}
