"use client";

import { useEffect } from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

const STORAGE_KEY = "solpient-money-autopilot-last-run";
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;

function shouldRefresh() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;

    const last = Date.parse(raw);
    if (!Number.isFinite(last)) return true;

    return Date.now() - last >= REFRESH_INTERVAL_MS;
  } catch {
    return true;
  }
}

export default function AutopilotDailyRunner() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;

    const run = async () => {
      if (disposed || !shouldRefresh()) return;

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch("/api/autopilot", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            force: false,
            runKind: "automatic",
          }),
          signal: controller.signal,
        });

        if (!response.ok) return;

        const body = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              briefing?: {
                tspPriceSync?: {
                  ok?: boolean;
                } | null;
              };
            }
          | null;

        if (!body?.ok || disposed) return;

        const tspSyncFailed =
          body.briefing?.tspPriceSync?.ok === false;

        if (!tspSyncFailed) {
          try {
            window.localStorage.setItem(
              STORAGE_KEY,
              new Date().toISOString()
            );
          } catch {
            // Server-side idempotency remains authoritative.
          }
        }

        window.dispatchEvent(
          new Event("solpient:autopilot-complete")
        );

        if (
          pathname === "/autopilot" ||
          pathname === "/action-center" ||
          pathname === "/tsp"
        ) {
          router.refresh();
        }
      } catch {
        // Never interrupt normal Money navigation because a background
        // intelligence or TSP price refresh failed.
      }
    };

    void run();

    const timer = window.setInterval(() => {
      void run();
    }, REFRESH_INTERVAL_MS);

    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}
