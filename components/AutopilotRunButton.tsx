"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function AutopilotRunButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runNow() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/autopilot", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          force: true,
          runKind: "manual",
        }),
      });

      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !body.ok) {
        throw new Error(
          body.error ?? "Money Autopilot refresh failed."
        );
      }

      router.refresh();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Money Autopilot refresh failed."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="autopilot-run-control">
      <button
        className="attention-button"
        type="button"
        onClick={runNow}
        disabled={running}
      >
        <RefreshCw
          size={16}
          className={running ? "spin" : ""}
        />
        <span>{running ? "Running..." : "Run Autopilot now"}</span>
      </button>
      {error ? (
        <p className="autopilot-error">{error}</p>
      ) : null}
    </div>
  );
}
