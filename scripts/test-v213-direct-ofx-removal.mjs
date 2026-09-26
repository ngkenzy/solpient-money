import { readFile } from "node:fs/promises";

const files = {
  registry: await readFile("lib/connect/registry.ts", "utf8"),
  sdk: await readFile("lib/connect/sdk.ts", "utf8"),
  panel: await readFile("components/ConnectorRegistryPanel.tsx", "utf8"),
  css: await readFile("app/globals.css", "utf8"),
  packageJson: await readFile("package.json", "utf8"),
  buildYml: await readFile(".github/workflows/build.yml", "utf8"),
  readme: await readFile("README.md", "utf8"),
  userGuide: await readFile("USER_GUIDE.md", "utf8"),
  guide: await readFile("components/VanguardFileImportGuide.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);
const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

async function gone(path) {
  try {
    await readFile(path, "utf8");
    return false;
  } catch {
    return true;
  }
}

async function exists(path) {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

// ---- Deleted: Direct OFX pages, routes, components ----
check("ofx page deleted", await gone("app/connect/ofx/page.tsx"));
check(
  "ofx connections route deleted",
  await gone("app/api/connect/ofx/connections/route.ts")
);
check(
  "ofx probe route deleted",
  await gone("app/api/connect/ofx/probe/route.ts")
);
check(
  "DirectOfxConnectionActions deleted",
  await gone("components/DirectOfxConnectionActions.tsx")
);
check(
  "DirectOfxSetupForm deleted",
  await gone("components/DirectOfxSetupForm.tsx")
);
check(
  "VanguardGuidedConnect deleted",
  await gone("components/VanguardGuidedConnect.tsx")
);

// ---- Deleted: Direct OFX library ----
check(
  "direct-ofx adapter deleted",
  await gone("lib/connect/adapters/direct-ofx.ts")
);
for (const name of [
  "client",
  "config",
  "institutions",
  "profile-request",
  "profile-response",
  "request",
  "secrets",
  "status",
  "types",
]) {
  check(
    `direct-ofx/${name} deleted`,
    await gone(`lib/connect/direct-ofx/${name}.ts`)
  );
}

// ---- Deleted: Direct OFX test scripts ----
check(
  "test:v211 script file deleted",
  await gone("scripts/test-v211-vanguard-guided-connect.mjs")
);
for (const name of [
  "test-connect-v1",
  "test-connect-v12",
  "test-connect-v13",
  "test-connect-v131",
]) {
  check(
    `${name} deleted`,
    await gone(`scripts/${name}.mjs`)
  );
}

// ---- Scrubbed: registry + sdk ----
check(
  "registry no longer references direct-ofx",
  !files.registry.includes("direct-ofx") &&
    !files.registry.includes("directOfxConnector")
);
check(
  "registry keeps the file connector",
  files.registry.includes("fileConnector")
);
check(
  "sdk no longer has the ofx-direct connector id",
  !files.sdk.includes("ofx-direct")
);
check(
  "sdk no longer has the direct-legacy kind",
  !files.sdk.includes("direct-legacy")
);
check(
  "registry panel no longer mentions Direct OFX",
  !files.panel.includes("Direct OFX")
);

// ---- Scrubbed: styles ----
check("css has no direct-ofx selectors", !files.css.includes("direct-ofx"));
check("css has no .ofx-config-card", !files.css.includes(".ofx-config-card"));
check(
  "css has no .ofx-security-grid",
  !files.css.includes(".ofx-security-grid")
);
check(
  "css has no v211 guided-step rules",
  !/\.vanguard-guided-step[\s{.:]/.test(files.css) &&
    !files.css.includes(".vanguard-guided-probe")
);
check(
  "css keeps the file-import guide styles",
  files.css.includes(".vanguard-file-steps") &&
    files.css.includes(".vanguard-guided-note")
);

// ---- Scrubbed: package + CI ----
for (const key of [
  "test:connect",
  "test:connect-v12",
  "test:connect-v13",
  "test:connect-v131",
  "test:connect-v132",
  "test:connect-v133",
  "test:v211",
]) {
  check(`package.json no longer has ${key}`, !(key in pkg.scripts));
}
check(
  "package.json keeps test:connect-v11",
  typeof pkg.scripts["test:connect-v11"] === "string"
);
check(
  "package.json keeps test:v212",
  typeof pkg.scripts["test:v212"] === "string"
);
check(
  "CI no longer runs the removed suites",
  !files.buildYml.includes("npm run test:v211") &&
    !files.buildYml.includes("npm run test:connect\n") &&
    !files.buildYml.includes("npm run test:connect-v12")
);
check(
  "CI still runs test:connect-v11",
  files.buildYml.includes("npm run test:connect-v11")
);
check(
  "CI still runs test:v212",
  files.buildYml.includes("npm run test:v212")
);
check(
  "CI runs test:v213",
  files.buildYml.includes("npm run test:v213")
);

// ---- Scrubbed: docs ----
check("README no longer mentions Direct OFX", !files.readme.includes("Direct OFX"));
check(
  "USER_GUIDE no longer mentions Direct OFX",
  !files.userGuide.includes("Direct OFX")
);
check(
  "README still documents file import",
  files.readme.includes("file import (CSV/QFX/OFX)")
);

check(
  "test:v213 script registered",
  typeof pkg.scripts?.["test:v213"] === "string" &&
    pkg.scripts["test:v213"].includes("test-v213")
);

// ---- Kept: the working file-import path ----
check(
  "OFX file parser kept (QFX/OFX uploads still work)",
  await exists("lib/connect/file-parser.ts")
);
check(
  "file connector adapter kept",
  await exists("lib/connect/adapters/file.ts")
);
check(
  "file-parser test suite kept",
  await exists("scripts/test-connect-v11.mjs")
);
check(
  "direct_ofx migration kept for existing databases",
  await exists("supabase/migrations/20260922123000_connect_v13_direct_ofx.sql")
);
check(
  "Vanguard file import guide kept and standalone",
  files.guide.includes("VanguardFileImportGuide") &&
    !files.guide.includes("Direct OFX")
);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

console.log(
  `\ntest:v213 ${checks.length - failed}/${checks.length} checks passed`
);
process.exit(failed === 0 ? 0 : 1);
