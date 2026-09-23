"use client";

import { useEffect, useState } from "react";

type Counts = {
  totalOpen?: number;
};

export default function ActionCenterNavBadge() {
  const [count, setCount] = useState(0);

  async function refresh() {
    try {
      const response = await fetch("/api/action-center", {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        ok?: boolean;
        counts?: Counts;
      };
      if (response.ok && body.ok) {
        setCount(Number(body.counts?.totalOpen ?? 0));
      }
    } catch {
      // A missing badge must never block navigation.
    }
  }

  useEffect(() => {
    void refresh();

    function onAutopilotComplete() {
      void refresh();
    }

    window.addEventListener(
      "solpient:autopilot-complete",
      onAutopilotComplete
    );

    return () => {
      window.removeEventListener(
        "solpient:autopilot-complete",
        onAutopilotComplete
      );
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span className="side-badge">
      {count > 99 ? "99+" : count}
    </span>
  );
}
