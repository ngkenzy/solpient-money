"use client";

import { useEffect, useState } from "react";

type Counts = {
  totalOpen?: number;
};

export default function ActionCenterNavBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      try {
        const response = await fetch("/api/action-center", {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          ok?: boolean;
          counts?: Counts;
        };

        if (
          !cancelled &&
          response.ok &&
          body.ok
        ) {
          setCount(
            Number(body.counts?.totalOpen ?? 0)
          );
        }
      } catch {
        // A missing badge must never block navigation.
      }
    }

    const timer = window.setTimeout(() => {
      void loadCount();
    }, 0);

    function onAutopilotComplete() {
      void loadCount();
    }

    window.addEventListener(
      "solpient:autopilot-complete",
      onAutopilotComplete
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
