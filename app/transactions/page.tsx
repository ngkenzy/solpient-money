import PageHeader from "@/components/PageHeader";
import TransactionsExplorer from "@/components/TransactionsExplorer";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const context = await requireMoneyDataset();

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
