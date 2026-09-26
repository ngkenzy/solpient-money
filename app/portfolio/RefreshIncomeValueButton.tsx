"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { refreshIncomeAndValue } from "./actions";

export default function RefreshIncomeValueButton() {
  const router = useRouter();
  const [pending, startTransition] =
    useTransition();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<
    boolean | null
  >(null);

  return (
    <div className="portfolio-refresh-prices">
      <button
        type="button"
        className="portfolio-refresh-prices-button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage("");
            setOk(null);

            const result =
              await refreshIncomeAndValue();

            setOk(result.ok);
            setMessage(result.message);

            if (result.ok) {
              router.refresh();
            }
          })
        }
      >
        <HandCoins size={15} />
        {pending
          ? "Refreshing…"
          : "Refresh dividends & value"}
      </button>
      {message ? (
        <small
          className={
            ok
              ? "positive-text"
              : "negative-text"
          }
        >
          {message}
        </small>
      ) : null}
    </div>
  );
}
