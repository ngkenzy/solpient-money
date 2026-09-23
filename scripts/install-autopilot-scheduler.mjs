import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  throw new Error(
    "The V1.4 local scheduler installer currently supports macOS launchd only."
  );
}

const repo = process.cwd();
const home = os.homedir();
const uid = process.getuid();
const domain = `gui/${uid}`;
const agentsDir = path.join(
  home,
  "Library",
  "LaunchAgents"
);
const logsDir = path.join(
  home,
  "Library",
  "Logs",
  "SolpientMoney"
);

const serverLabel =
  "com.solpient.money.scheduler-server";
const autopilotLabel =
  "com.solpient.money.autopilot";

const serverPlist = path.join(
  agentsDir,
  `${serverLabel}.plist`
);
const autopilotPlist = path.join(
  agentsDir,
  `${autopilotLabel}.plist`
);

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) =>
    item.startsWith(prefix)
  );
  return value
    ? value.slice(prefix.length)
    : fallback;
}

const hour = Number.parseInt(
  arg("hour", "8"),
  10
);
const minute = Number.parseInt(
  arg("minute", "0"),
  10
);

if (
  !Number.isInteger(hour) ||
  hour < 0 ||
  hour > 23 ||
  !Number.isInteger(minute) ||
  minute < 0 ||
  minute > 59
) {
  throw new Error(
    "Scheduler time must use --hour=0..23 and --minute=0..59."
  );
}

await mkdir(agentsDir, {
  recursive: true,
});
await mkdir(logsDir, {
  recursive: true,
});

console.log(
  "Building the production scheduler service..."
);

const build = spawnSync(
  "npm",
  ["run", "build"],
  {
    cwd: repo,
    stdio: "inherit",
    env: process.env,
  }
);

if (build.status !== 0) {
  throw new Error(
    "Production build failed; scheduler was not installed."
  );
}

const node = process.execPath;
const nextBin = path.join(
  repo,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);
const scheduledRunner = path.join(
  repo,
  "scripts",
  "run-scheduled-autopilot.mjs"
);

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const server = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${serverLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(nextBin)}</string>
    <string>start</string>
    <string>-H</string>
    <string>127.0.0.1</string>
    <string>-p</string>
    <string>3210</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(repo)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(path.join(logsDir, "server.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(path.join(logsDir, "server-error.log"))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>
`;

const autopilot = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${autopilotLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(scheduledRunner)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(repo)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(path.join(logsDir, "autopilot.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(path.join(logsDir, "autopilot-error.log"))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SOLPIENT_SCHEDULER_URL</key>
    <string>http://127.0.0.1:3210</string>
  </dict>
</dict>
</plist>
`;

await writeFile(
  serverPlist,
  server,
  "utf8"
);
await writeFile(
  autopilotPlist,
  autopilot,
  "utf8"
);

for (const [label, plist] of [
  [serverLabel, serverPlist],
  [autopilotLabel, autopilotPlist],
]) {
  spawnSync(
    "launchctl",
    ["bootout", domain, plist],
    { stdio: "ignore" }
  );

  const loaded = spawnSync(
    "launchctl",
    ["bootstrap", domain, plist],
    { encoding: "utf8" }
  );

  if (loaded.status !== 0) {
    throw new Error(
      `Unable to install ${label}: ${loaded.stderr || "launchctl bootstrap failed"}`
    );
  }
}

spawnSync(
  "launchctl",
  [
    "kickstart",
    "-k",
    `${domain}/${serverLabel}`,
  ],
  { stdio: "ignore" }
);

console.log("");
console.log(
  "✓ Solpient background server installed on 127.0.0.1:3210"
);
console.log(
  `✓ Daily Money Autopilot scheduled for ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
);
console.log(
  "✓ Logs: ~/Library/Logs/SolpientMoney"
);
console.log(
  "✓ Browser can remain closed; launchd runs the daily job."
);
console.log("");
console.log(
  "Check status with: npm run local:scheduler:status"
);
