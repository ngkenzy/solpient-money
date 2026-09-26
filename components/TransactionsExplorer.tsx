"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { Transaction } from "@/lib/demo-data";
import { money } from "@/lib/finance";

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: Transaction[]) {
  const header = ["Date", "Description", "Category", "Account", "Type", "Amount"];
  const lines = rows.map((t) =>
    [t.date, t.merchant, t.category, t.account, t.type, Number(t.amount).toFixed(2)]
      .map(csvCell)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function TransactionsExplorer({ transactions }: { transactions: Transaction[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [type, setType] = useState("all");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(transactions.map((t) => t.category))).sort()],
    [transactions]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const matchesSearch =
        !normalized ||
        transaction.merchant.toLowerCase().includes(normalized) ||
        transaction.account.toLowerCase().includes(normalized) ||
        transaction.category.toLowerCase().includes(normalized);
      const matchesCategory = category === "All" || transaction.category === category;
      const matchesType = type === "all" || transaction.type === type;
      return matchesSearch && matchesCategory && matchesType;
    });
  }, [transactions, query, category, type]);

  const total = filtered.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="card explorer-card">
      <div className="transaction-controls">
        <label className="transaction-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search merchant, category, or account"
          />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="transfer">Transfers</option>
        </select>
      </div>

      <div className="table-summary">
        <span>{filtered.length} transactions</span>
        <span>Net selected activity <strong className={total >= 0 ? "positive-text" : "negative-text"}>{money(total, true)}</strong></span>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            downloadCsv(
              `solpient-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
              filtered
            )
          }
          title="Download the currently filtered transactions as CSV"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="data-table transaction-table">
        <div className="table-row table-head-row">
          <span>Date</span><span>Description</span><span>Category</span><span>Account</span><span>Amount</span>
        </div>
        {filtered.map((transaction) => (
          <div className="table-row" key={transaction.id}>
            <span>{transaction.date}</span>
            <strong className="transaction-description">
              <span>{transaction.merchant}</span>
              {transaction.source === "plaid" ? <em className="source-badge plaid-test">PLAID TEST</em> : transaction.source === "file" ? <em className="source-badge file-import">FILE IMPORT</em> : transaction.source === "fdx" ? <em className="source-badge fdx-source">OAUTH / FDX</em> : null}
            </strong>
            <span><span className="category-pill">{transaction.category}</span></span>
            <span>{transaction.account}</span>
            <strong className={transaction.amount >= 0 ? "positive-text" : ""}>
              {transaction.amount > 0 ? "+" : ""}{money(transaction.amount, true)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}
