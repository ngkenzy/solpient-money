"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateTspFundPrice,
  type TspFundPriceState,
} from "./actions";

const INITIAL_STATE: TspFundPriceState = {
  ok: false,
  message: "",
};

export default function TspFundPriceForm({
  ticker,
  price,
}: {
  ticker: string;
  price: number;
}) {
  const router = useRouter();
  const [state, action, pending] =
    useActionState(
      updateTspFundPrice,
      INITIAL_STATE
    );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <form
      action={action}
      className="tsp-fund-price-form"
    >
      <input
        type="hidden"
        name="ticker"
        value={ticker}
      />
      <input
        aria-label={`Fund price for ${ticker}`}
        type="number"
        name="fundPrice"
        min="0.000001"
        step="0.000001"
        defaultValue={price.toFixed(6)}
        required
      />
      <button
        type="submit"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.message ? (
        <small
          className={
            state.ok
              ? "positive-text"
              : "negative-text"
          }
        >
          {state.message}
        </small>
      ) : null}
    </form>
  );
}
