import PageHeader from "@/components/PageHeader";
import TransactionsExplorer from "@/components/TransactionsExplorer";
import { transactions } from "@/lib/demo-data";

export default function TransactionsPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="TRANSACTIONS"
        title="Know where the money moved."
        description="Search and filter deterministic demo activity by merchant, category, account, or transaction type."
      />
      <TransactionsExplorer transactions={transactions} />
    </div>
  );
}
