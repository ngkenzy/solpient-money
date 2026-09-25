"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { pullLatestTspPrices } from "./actions";

export default function TspPullPricesButton() {
  const router = useRouter();
  const [pending, startTransition] =
    useTransition();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<
    boolean | null
  >(null);

  return (
    <div className="tsp-pull-prices">
      <button
        type="button"
        className="tsp-pull-prices-button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage("");
            setOk(null);

            const result =
              await pullLatestTspPrices();

            setOk(result.ok);
            setMessage(result.message);

            if (result.ok) {
              router.refresh();
            }
          })
        }
      >
        <RefreshCw size={15} />
        {pending
          ? "Pulling…"
          : "Pull latest prices"}
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
