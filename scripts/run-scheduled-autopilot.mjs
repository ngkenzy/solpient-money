import { spawnSync } from "node:child_process";

const BASE_URL =
  process.env.SOLPIENT_SCHEDULER_URL?.trim() ||
  "http://127.0.0.1:3210";

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function escapeAppleScript(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}

function notify(title, body) {
  if (process.platform !== "darwin") return;

  const script =
    `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`;

  spawnSync("osascript", ["-e", script], {
    stdio: "ignore",
  });
}

async function run() {
  let lastError = null;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(
        `${BASE_URL}/api/autopilot`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            force: false,
            runKind: "automatic",
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      const body = await response.json();

      if (!response.ok || !body?.ok) {
        throw new Error(
          body?.error ??
            `Autopilot returned HTTP ${response.status}`
        );
      }

      const briefing = body.briefing ?? {};
      const tspPriceSync = briefing.tspPriceSync ?? null;

      if (tspPriceSync?.ok === false) {
        throw new Error(
          tspPriceSync.warning ??
            "Automatic TSP share-price refresh failed."
        );
      }

      const critical = Number(
        briefing.criticalCount ?? 0
      );
      const watch = Number(
        briefing.watchCount ?? 0
      );

      console.log(
        JSON.stringify(
          {
            ok: true,
            runDate: briefing.runDate ?? null,
            critical,
            watch,
            skippedBecauseAlreadyRun:
              Boolean(
                briefing.skippedBecauseAlreadyRun
              ),
          },
          null,
          2
        )
      );

      if (critical > 0 || watch > 0) {
        notify(
          "Solpient Money",
          `${critical} critical · ${watch} watch item${critical + watch === 1 ? "" : "s"} in Action Center`
        );
      }

      return;
    } catch (error) {
      lastError = error;
      if (attempt < 10) {
        await sleep(2_000);
      }
    }
  }

  throw new Error(
    `Scheduled Money Autopilot failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

await run();
