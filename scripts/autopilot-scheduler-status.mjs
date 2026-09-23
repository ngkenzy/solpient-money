import os from "node:os";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  console.log(
    "V1.4 scheduler status is available on macOS only."
  );
  process.exit(0);
}

const uid = process.getuid();
const domain = `gui/${uid}`;

function statusFor(label) {
  const result = spawnSync(
    "launchctl",
    ["print", `${domain}/${label}`],
    { encoding: "utf8" }
  );

  return result.status === 0
    ? "installed"
    : "not installed";
}

console.log(
  `Background server: ${statusFor("com.solpient.money.scheduler-server")}`
);
console.log(
  `Daily Autopilot:   ${statusFor("com.solpient.money.autopilot")}`
);

try {
  const response = await fetch(
    "http://127.0.0.1:3210/api/action-center",
    {
      signal: AbortSignal.timeout(3_000),
    }
  );
  console.log(
    `Scheduler service: ${response.ok ? "reachable" : `HTTP ${response.status}`}`
  );
} catch {
  console.log(
    "Scheduler service: not reachable"
  );
}
