import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDirectOfxRequest } from "../lib/connect/direct-ofx/request.ts";
import { validateDirectOfxUrl } from "../lib/connect/direct-ofx/client.ts";
import { parseOfxStatus, assertOfxSuccess } from "../lib/connect/direct-ofx/status.ts";
import {
  encryptConnectorSecret,
  decryptConnectorSecret,
} from "../lib/connect/secret-crypto.ts";

process.env.CONNECT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const connection = {
  id: "11111111-1111-1111-1111-111111111111",
  household_id: "22222222-2222-2222-2222-222222222222",
  institution_name: "Example Bank",
  endpoint_url: "https://ofx.example.com/ofx",
  org: "EXAMPLE",
  fid: "12345",
  message_set: "banking",
  account_type: "CHECKING",
  account_mask: "4321",
  app_id: "SOLPIENT",
  app_ver: "0100",
  status: "active",
  last_synced_at: null,
  last_error_code: null,
  last_error_message: null,
};

const secret = {
  authMode: "app_password",
  userId: "direct-user",
  credential: "app-credential",
  accountId: "123456789",
  bankId: "021000021",
  clientUid: "client-123",
  authToken: "one-time-token",
};

const request = buildDirectOfxRequest({
  connection,
  secret,
  days: 30,
  now: new Date("2026-09-22T12:00:00Z"),
});

assert.ok(request.includes("OFXHEADER:100"));
assert.ok(request.includes("<BANKMSGSRQV1>"));
assert.ok(request.includes("<USERID>direct-user</USERID>"));
assert.ok(request.includes("<USERPASS>app-credential</USERPASS>"));
assert.ok(request.includes("<CLIENTUID>client-123</CLIENTUID>"));
assert.ok(request.includes("<AUTHTOKEN>one-time-token</AUTHTOKEN>"));
assert.ok(request.includes("<BANKID>021000021</BANKID>"));
assert.ok(request.includes("<ACCTID>123456789</ACCTID>"));
assert.ok(request.includes("<ACCTTYPE>CHECKING</ACCTTYPE>"));
assert.ok(request.includes("<APPID>SOLPIENT</APPID>"));
assert.ok(request.includes("<APPVER>0100</APPVER>"));

const investment = buildDirectOfxRequest({
  connection: {
    ...connection,
    message_set: "investment",
    account_type: null,
  },
  secret: {
    ...secret,
    bankId: undefined,
    brokerId: "broker.example.com",
    authMode: "userkey",
    credential: "USER-KEY-1",
  },
  now: new Date("2026-09-22T12:00:00Z"),
});
assert.ok(investment.includes("<INVSTMTMSGSRQV1>"));
assert.ok(investment.includes("<BROKERID>broker.example.com</BROKERID>"));
assert.ok(investment.includes("<USERKEY>USER-KEY-1</USERKEY>"));
assert.ok(!investment.includes("<USERPASS>"));

const credit = buildDirectOfxRequest({
  connection: {
    ...connection,
    message_set: "credit_card",
    account_type: null,
  },
  secret: {
    ...secret,
    bankId: undefined,
  },
  now: new Date("2026-09-22T12:00:00Z"),
});
assert.ok(credit.includes("<CREDITCARDMSGSRQV1>"));
assert.ok(credit.includes("<CCACCTFROM>"));

assert.equal(validateDirectOfxUrl("https://ofx.example.com/ofx").protocol, "https:");
assert.throws(() => validateDirectOfxUrl("http://ofx.example.com/ofx"), /HTTPS/);
assert.throws(() => validateDirectOfxUrl("https://localhost/ofx"), /Local\/private/);
assert.throws(() => validateDirectOfxUrl("https://127.0.0.1/ofx"), /Private-network/);
assert.throws(() => validateDirectOfxUrl("https://10.0.0.1/ofx"), /Private-network/);
assert.throws(() => validateDirectOfxUrl("https://user:pass@ofx.example.com/ofx"), /credentials/);
assert.throws(() => validateDirectOfxUrl("https://ofx.example.com:8443/ofx"), /port 443/);

const okResponse = "<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS></SONRS></SIGNONMSGSRSV1></OFX>";
assert.equal(parseOfxStatus(okResponse).code, "0");
assert.doesNotThrow(() => assertOfxSuccess(okResponse));

const authResponse = "<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>15512<SEVERITY>ERROR<MESSAGE>Auth token required</STATUS></SONRS></SIGNONMSGSRSV1></OFX>";
assert.equal(parseOfxStatus(authResponse).code, "15512");
assert.throws(() => assertOfxSuccess(authResponse), /15512/);

const encrypted = encryptConnectorSecret(JSON.stringify(secret));
assert.notEqual(encrypted.ciphertext, JSON.stringify(secret));
assert.equal(
  decryptConnectorSecret(encrypted),
  JSON.stringify(secret)
);

const migration = await readFile(
  "supabase/migrations/20260922123000_connect_v13_direct_ofx.sql",
  "utf8"
);
const adapter = await readFile(
  "lib/connect/adapters/direct-ofx.ts",
  "utf8"
);
const connectionApi = await readFile(
  "app/api/connect/ofx/connections/route.ts",
  "utf8"
);
const client = await readFile(
  "lib/connect/direct-ofx/client.ts",
  "utf8"
);
const setup = await readFile(
  "components/DirectOfxSetupForm.tsx",
  "utf8"
);
const registry = await readFile(
  "lib/connect/registry.ts",
  "utf8"
);

assert.ok(migration.includes("alter table public.direct_ofx_connections enable row level security"));
assert.ok(migration.includes("alter table private.direct_ofx_secrets enable row level security"));
assert.ok(migration.includes("security invoker"));
assert.ok(migration.includes("'ofx_direct'"));
assert.ok(migration.includes("transactions_direct_ofx_external_unique"));
assert.ok(migration.includes("holdings_direct_ofx_ticker_unique"));

assert.ok(adapter.includes('id: "ofx-direct"'));
assert.ok(adapter.includes('maturity: "live"'));
assert.ok(adapter.includes('source: "ofx_direct"'));
assert.ok(adapter.includes("loadDirectOfxSecret"));
assert.ok(adapter.includes("postDirectOfx"));
assert.ok(adapter.includes('ofxCode === "15512"'));

assert.ok(client.includes('url.protocol !== "https:"'));
assert.ok(client.includes('url.port !== "443"'));
assert.ok(client.includes("resolvePublicAddress"));
assert.ok(client.includes("MAX_RESPONSE_BYTES"));
assert.ok(client.includes("redirect") === false);

assert.ok(connectionApi.includes("credentialIsDedicated"));
assert.ok(connectionApi.includes("validateDirectOfxUrl"));
assert.ok(connectionApi.includes("storeDirectOfxSecret"));
assert.ok(setup.includes("Do not enter your normal online-banking password"));
assert.ok(setup.includes("Save + test connection"));
assert.ok(registry.includes('adapters/direct-ofx'));

console.log("Solpient Connect V1.3 Direct OFX checks passed.");
