import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

if (!process.execArgv.some((arg) => arg.includes("strip-types"))) {
  const rerun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit" }
  );
  process.exit(rerun.status ?? 1);
}

const {
  getDirectOfxInstitutionProfile,
  guidedProfileConnectionValues,
} = await import("../lib/connect/direct-ofx/institutions.ts");

const files = {
  institutions: await readFile(
    "lib/connect/direct-ofx/institutions.ts",
    "utf8"
  ),
  route: await readFile(
    "app/api/connect/ofx/connections/route.ts",
    "utf8"
  ),
  component: await readFile(
    "components/VanguardGuidedConnect.tsx",
    "utf8"
  ),
  ofxPage: await readFile("app/connect/ofx/page.tsx", "utf8"),
  css: await readFile("app/globals.css", "utf8"),
  packageJson: await readFile("package.json", "utf8"),
  buildYml: await readFile(".github/workflows/build.yml", "utf8"),
};

const pkg = JSON.parse(files.packageJson);
const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

// ---- Runtime: guided profile value resolution ----
const vanguard = getDirectOfxInstitutionProfile("vanguard");
check("vanguard profile exists and is a candidate", vanguard?.status === "candidate");

const guided = guidedProfileConnectionValues(vanguard);
check(
  "guided values resolve the Vanguard OFX endpoint server-side",
  guided?.endpointUrl ===
    "https://vesnc.vanguard.com/us/OfxDirectConnectServlet"
);
check(
  "guided values use the investment message set",
  guided?.messageSet === "investment"
);
check(
  "guided values carry the Vanguard broker identifier",
  guided?.brokerId === "vanguard.com"
);
check(
  "guided values carry ORG/FID pairing",
  Boolean(guided?.org) && Boolean(guided?.fid)
);
check(
  "guided values keep the non-impersonating app identity",
  guided?.appId === "SOLPIENT" && guided?.appVer === "0100"
);

const chase = getDirectOfxInstitutionProfile("chase");
check(
  "unsupported profiles (Chase) resolve to null",
  guidedProfileConnectionValues(chase) === null
);
const bofa = getDirectOfxInstitutionProfile("bank-of-america");
check(
  "unsupported profiles (Bank of America) resolve to null",
  guidedProfileConnectionValues(bofa) === null
);
check(
  "unknown profiles resolve to null",
  guidedProfileConnectionValues(undefined) === null &&
    guidedProfileConnectionValues(
      getDirectOfxInstitutionProfile("nope")
    ) === null
);

// ---- Static: API route wiring ----
check(
  "connections route accepts a profileId",
  files.route.includes("body.profileId")
);
check(
  "connections route resolves institution values server-side from the profile",
  files.route.includes("guidedProfileConnectionValues(") &&
    files.route.includes("getDirectOfxInstitutionProfile(profileId)")
);
check(
  "connections route rejects unknown/unsupported profiles",
  files.route.includes("Unknown or unsupported Direct OFX institution profile")
);
check(
  "connections route ignores client-supplied endpoint when guided",
  /guidedValues\s*\?\s*guidedValues\.endpointUrl/.test(files.route)
);
check(
  "connections route still requires explicit credential confirmation",
  files.route.includes("credentialIsDedicated !== true")
);

// ---- Static: guided component ----
check(
  "guided component probes Vanguard anonymously first",
  files.component.includes('"/api/connect/ofx/probe"') &&
    files.component.includes('profileId: "vanguard"')
);
check(
  "guided component creates the connection with profileId only",
  files.component.includes('"/api/connect/ofx/connections"') &&
    /profileId:\s*"vanguard"/.test(files.component)
);
check(
  "guided component asks only for username, password, and account number",
  files.component.includes("userId") &&
    files.component.includes("credential") &&
    files.component.includes("accountId") &&
    !files.component.includes("endpointUrl")
);
check(
  "guided component runs a sync after saving",
  files.component.includes('"/api/connect/sync"') &&
    files.component.includes('connectorId: "ofx-direct"')
);
check(
  "guided component gates on the encrypted vault being configured",
  files.component.includes("CONNECT_SECRET_ENCRYPTION_KEY")
);
check(
  "guided component explains one connection per Vanguard account",
  /one connection syncs one account/i.test(files.component)
);

// ---- Static: page + styles + wiring ----
check(
  "OFX page renders the guided Vanguard section",
  files.ofxPage.includes("VanguardGuidedConnect")
);
check(
  "guided styles are present",
  files.css.includes(".vanguard-guided") &&
    files.css.includes(".vanguard-guided-steps") &&
    files.css.includes(".vanguard-guided-probe")
);
check(
  "package.json wires test:v211",
  pkg.scripts?.["test:v211"] ===
    "node scripts/test-v211-vanguard-guided-connect.mjs"
);
check(
  "CI runs test:v211",
  files.buildYml.includes("npm run test:v211")
);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
