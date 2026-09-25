import { ReceiptText } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import TransactionsExplorer from "@/components/TransactionsExplorer";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const context = await requireMoneyDataset();

  if (!context.dataset.transactions.length) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="TRANSACTIONS"
          title="Know where the money moved."
          description="Search and filter every transaction in the household."
        />
        <EmptyState
          icon={ReceiptText}
          title="No transactions yet"
          copy="Import a bank or credit-card CSV and Solpient categorizes every row automatically — no manual entry."
          actionHref="/connect"
          actionLabel="Import transactions"
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="TRANSACTIONS"
        title="Know where the money moved."
        description={context.source === "database" ? "Search and filter persisted household transactions." : "Search and filter deterministic demo activity until the Money database is connected."}
      />
      <TransactionsExplorer transactions={context.dataset.transactions} />
    </div>
  );
}
