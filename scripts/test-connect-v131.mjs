import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  directOfxInstitutionProfiles,
  getDirectOfxInstitutionProfile,
} from "../lib/connect/direct-ofx/institutions.ts";
import { buildAnonymousProfileRequest } from "../lib/connect/direct-ofx/profile-request.ts";
import { parseDirectOfxProfileResponse } from "../lib/connect/direct-ofx/profile-response.ts";

const vanguard = getDirectOfxInstitutionProfile("vanguard");
assert.ok(vanguard);
assert.equal(vanguard.status, "candidate");
assert.equal(vanguard.messageSet, "investment");
assert.equal(
  vanguard.endpointUrl,
  "https://vesnc.vanguard.com/us/OfxDirectConnectServlet"
);
assert.equal(
  vanguard.profileEndpointUrl,
  "https://vesnc.vanguard.com/us/OfxProfileServlet"
);
assert.equal(vanguard.org, "The Vanguard Group");
assert.equal(vanguard.fid, "1358");
assert.equal(vanguard.brokerId, "vanguard.com");
assert.equal(vanguard.appId, "SOLPIENT");

const bofa = getDirectOfxInstitutionProfile("bank-of-america");
const chase = getDirectOfxInstitutionProfile("chase");
assert.equal(bofa?.status, "unsupported");
assert.equal(chase?.status, "unsupported");
assert.equal(directOfxInstitutionProfiles.length >= 3, true);

const request = buildAnonymousProfileRequest(
  vanguard,
  new Date("2026-09-22T13:00:00Z")
);
assert.ok(request.includes("<PROFMSGSRQV1>"));
assert.ok(request.includes("<CLIENTROUTING>MSGSET</CLIENTROUTING>"));
assert.ok(request.includes("<DTPROFUP>19900101</DTPROFUP>"));
assert.ok(request.includes("<APPID>SOLPIENT</APPID>"));
assert.ok(request.includes("<FID>1358</FID>"));
assert.ok(request.includes("anonymous00000000000000000000000"));
assert.ok(!request.includes("<APPID>QWIN</APPID>"));
assert.ok(!request.includes("<APPID>QBW</APPID>"));

const profileResponse = `
<OFX>
<SIGNONMSGSRSV1>
<SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS></SONRS>
</SIGNONMSGSRSV1>
<PROFMSGSRSV1>
<PROFTRNRS>
<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
<PROFRS>
<DTPROFUP>20260922000000</DTPROFUP>
<FINAME>Example Financial Institution</FINAME>
<MSGSETLIST>
<INVSTMTMSGSETV1><INVSTMTMSGSET><URL>https://example.com/inv</URL></INVSTMTMSGSET></INVSTMTMSGSETV1>
<BANKMSGSETV1><BANKMSGSET><URL>https://example.com/bank</URL></BANKMSGSET></BANKMSGSETV1>
</MSGSETLIST>
</PROFRS>
</PROFTRNRS>
</PROFMSGSRSV1>
</OFX>`;

const parsed = parseDirectOfxProfileResponse(profileResponse);
assert.equal(parsed.reachable, true);
assert.equal(parsed.ofxResponse, true);
assert.equal(parsed.accepted, true);
assert.equal(parsed.financialInstitutionName, "Example Financial Institution");
assert.equal(parsed.supportsInvestment, true);
assert.equal(parsed.supportsBanking, true);
assert.equal(parsed.supportsCreditCard, false);
assert.equal(parsed.advertisedUrls.length, 2);

const rejected = parseDirectOfxProfileResponse(
  "<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>15500</CODE><SEVERITY>ERROR</SEVERITY><MESSAGE>Signon invalid</MESSAGE></STATUS></SONRS></SIGNONMSGSRSV1></OFX>"
);
assert.equal(rejected.accepted, false);
assert.equal(rejected.code, "15500");
assert.equal(rejected.message, "Signon invalid");

const nonOfx = parseDirectOfxProfileResponse("<html>blocked</html>");
assert.equal(nonOfx.reachable, true);
assert.equal(nonOfx.ofxResponse, false);
assert.equal(nonOfx.accepted, false);

const route = await readFile(
  "app/api/connect/ofx/probe/route.ts",
  "utf8"
);
const setup = await readFile(
  "components/DirectOfxSetupForm.tsx",
  "utf8"
);
const institutions = await readFile(
  "lib/connect/direct-ofx/institutions.ts",
  "utf8"
);

assert.ok(route.includes("getDirectOfxInstitutionProfile"));
assert.ok(route.includes("buildAnonymousProfileRequest"));
assert.ok(route.includes("profile.profileEndpointUrl ?? profile.endpointUrl"));
assert.ok(route.includes('stage: "profile_probe"'));
assert.ok(route.includes("parseDirectOfxProfileResponse"));
assert.ok(!route.includes("endpointUrl?:"));
assert.ok(setup.includes("Probe anonymously"));
assert.ok(setup.includes("Use profile"));
assert.ok(setup.includes("APPID=SOLPIENT"));
assert.ok(institutions.includes("Bank of America / Merrill"));
assert.ok(institutions.includes("Chase"));
assert.ok(institutions.includes("Direct OFX"));

console.log("Solpient Connect V1.3.1 institution profile checks passed.");
