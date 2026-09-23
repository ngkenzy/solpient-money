"use client";

import { useEffect } from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

const STORAGE_KEY = "solpient-money-autopilot-last-run";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function AutopilotDailyRunner() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const today = todayKey();

    try {
      if (window.localStorage.getItem(STORAGE_KEY) === today) {
        return;
      }
    } catch {
      // Autopilot can still run when localStorage is unavailable.
    }

    const controller = new AbortController();

    void fetch("/api/autopilot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        force: false,
        runKind: "automatic",
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;

        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean }
          | null;

        if (body?.ok) {
          try {
            window.localStorage.setItem(STORAGE_KEY, today);
          } catch {
            // The server-side daily idempotency gate remains authoritative.
          }

          if (pathname === "/autopilot") {
            router.refresh();
          }
        }
      })
      .catch(() => {
        // Never interrupt normal Money navigation because an automatic
        // intelligence refresh failed. /autopilot surfaces the error state.
      });

    return () => controller.abort();
  }, [pathname, router]);

  return null;
}
