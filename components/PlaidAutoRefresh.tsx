"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function PlaidAutoRefresh({
  enabled,
  connectionCount,
}: {
  enabled: boolean;
  connectionCount: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const [message, setMessage] = useState(
    connectionCount > 0 ? "Auto-refresh every 5 minutes while this page is open." : "No Items to refresh."
  );
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || connectionCount === 0 || running.current) return;
    running.current = true;
    setStatus("syncing");
    setMessage("Refreshing Sandbox Items...");

    try {
      const response = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Automatic refresh failed.");

      const failed = Array.isArray(body.results)
        ? body.results.filter((result: { ok?: boolean }) => result.ok !== true).length
        : 0;

      if (failed > 0) {
        setStatus("error");
        setMessage(`${failed} Sandbox Item${failed === 1 ? "" : "s"} need attention.`);
      } else {
        setStatus("ok");
        setMessage(`Checked ${connectionCount} Sandbox Item${connectionCount === 1 ? "" : "s"} just now.`);
      }
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Automatic refresh failed.");
    } finally {
      running.current = false;
    }
  }, [connectionCount, enabled, router]);

  useEffect(() => {
    if (!enabled || connectionCount === 0) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [connectionCount, enabled, refresh]);

  return (
    <div className={"plaid-auto-refresh " + status}>
      <RefreshCw size={14} className={status === "syncing" ? "spin" : ""} />
      <div>
        <strong>Automatic Sandbox refresh</strong>
        <span>{message}</span>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={!enabled || connectionCount === 0 || status === "syncing"}>
        Refresh now
      </button>
    </div>
  );
}
