import {
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  throw new Error(
    "The V1.4 local scheduler uninstaller currently supports macOS launchd only."
  );
}

const home = os.homedir();
const uid = process.getuid();
const domain = `gui/${uid}`;
const agentsDir = path.join(
  home,
  "Library",
  "LaunchAgents"
);

for (const label of [
  "com.solpient.money.autopilot",
  "com.solpient.money.scheduler-server",
]) {
  const plist = path.join(
    agentsDir,
    `${label}.plist`
  );

  spawnSync(
    "launchctl",
    ["bootout", domain, plist],
    { stdio: "ignore" }
  );

  await rm(plist, {
    force: true,
  });
}

console.log(
  "✓ Solpient Money scheduler LaunchAgents removed."
);
console.log(
  "Financial data and scheduler logs were not deleted."
);
