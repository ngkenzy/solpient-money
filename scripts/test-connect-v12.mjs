import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aggregateConnectorHealth,
  connectorHealthRank,
  latestSync,
} from "../lib/connect/sdk.ts";

const sdk = await readFile("lib/connect/sdk.ts", "utf8");
const registry = await readFile("lib/connect/registry.ts", "utf8");
const fileAdapter = await readFile("lib/connect/adapters/file.ts", "utf8");
const plaidAdapter = await readFile("lib/connect/adapters/plaid.ts", "utf8");
const futureAdapters = await readFile("lib/connect/adapters/future.ts", "utf8");
const directOfxAdapter = await readFile("lib/connect/adapters/direct-ofx.ts", "utf8");
const route = await readFile("app/api/connect/sync/route.ts", "utf8");
const legacyRoute = await readFile("app/api/plaid/sync/route.ts", "utf8");
const panel = await readFile("components/ConnectorRegistryPanel.tsx", "utf8");
const shell = await readFile("components/AppShell.tsx", "utf8");
const connectPage = await readFile("app/connect/page.tsx", "utf8");
const plaidActions = await readFile("components/PlaidConnectionActions.tsx", "utf8");
const autoRefresh = await readFile("components/PlaidAutoRefresh.tsx", "utf8");

assert.ok(sdk.includes("export interface SolpientConnectorAdapter"));
assert.ok(sdk.includes("export type ConnectorCapabilities"));
assert.ok(sdk.includes("export type ConnectorProvenance"));
assert.ok(sdk.includes("export type NormalizedConnectorAccount"));
assert.ok(sdk.includes("export type NormalizedConnectorTransaction"));
assert.ok(sdk.includes("export type NormalizedConnectorHolding"));
assert.ok(sdk.includes("export type NormalizedConnectorLiability"));
assert.ok(sdk.includes("export type ConnectorSyncResult"));

assert.ok(registry.includes("fileConnector"));
assert.ok(registry.includes("plaidConnector"));
assert.ok(registry.includes("fdxConnector"));
assert.ok(registry.includes("directOfxConnector"));
assert.ok(registry.includes("runConnectorSync"));

assert.ok(fileAdapter.includes('id: "files"'));
assert.ok(fileAdapter.includes("manualImport: true"));
assert.ok(fileAdapter.includes("reconciliation: true"));
assert.ok(plaidAdapter.includes('id: "plaid"'));
assert.ok(plaidAdapter.includes("automaticSync: true"));
assert.ok(plaidAdapter.includes("repair: true"));
assert.ok(futureAdapters.includes('id: "fdx"'));
assert.ok(directOfxAdapter.includes('id: "ofx-direct"'));
assert.ok(directOfxAdapter.includes('maturity: "live"'));

assert.ok(route.includes("isConnectorId"));
assert.ok(route.includes("runConnectorSync"));
assert.ok(legacyRoute.includes("runConnectorSync"));
assert.ok(plaidActions.includes('fetch("/api/connect/sync"'));
assert.ok(autoRefresh.includes('fetch("/api/connect/sync"'));

assert.ok(connectPage.includes("getConnectorOverviews"));
assert.ok(connectPage.includes("<ConnectorRegistryPanel"));
assert.ok(panel.includes("UNIFIED CONNECTION HEALTH"));
assert.ok(panel.includes("capabilities"));
assert.ok(shell.includes('href: "/connect"'));
assert.ok(!shell.includes('label: "Plaid Sandbox"'));

const healthy = {
  id: "a",
  connectorId: "files",
  name: "One",
  detail: "test",
  health: "healthy",
  accountCount: 1,
  lastSyncedAt: "2026-09-22T12:00:00.000Z",
  canSync: false,
  canRepair: false,
  canDisconnect: false,
};
const stale = {
  ...healthy,
  id: "b",
  health: "stale",
  lastSyncedAt: "2026-09-20T12:00:00.000Z",
};

assert.ok(connectorHealthRank("attention") > connectorHealthRank("healthy"));
assert.equal(aggregateConnectorHealth([healthy, stale], "idle"), "stale");
assert.equal(latestSync([healthy, stale]), "2026-09-22T12:00:00.000Z");

console.log("Solpient Connect V1.2 Connector SDK checks passed.");
