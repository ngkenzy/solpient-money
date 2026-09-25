import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  copy: string;
  actionHref?: string;
  actionLabel?: string;
}

/** Zero-data state: icon, headline, one line of guidance, one CTA. Never a blank card. */
export default function EmptyState({ icon: Icon, title, copy, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <section className="card page-card">
      <div className="cash-empty roomy">
        <Icon size={29} />
        <strong>{title}</strong>
        <span>{copy}</span>
        {actionHref && actionLabel ? (
          <Link className="research-button" href={actionHref} style={{ marginTop: 10 }}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
