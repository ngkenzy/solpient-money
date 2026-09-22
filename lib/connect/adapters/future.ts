import type {
  ConnectorManifest,
  ConnectorOverview,
  SolpientConnectorAdapter,
} from "@/lib/connect/sdk";

function futureOverview(
  manifest: ConnectorManifest
): ConnectorOverview {
  return {
    manifest,
    health: "unavailable",
    instanceCount: 0,
    accountCount: 0,
    staleCount: 0,
    attentionCount: 0,
    lastSyncedAt: null,
    instances: [],
  };
}

export const fdxConnector: SolpientConnectorAdapter = {
  manifest: {
    id: "fdx",
    name: "FDX / OAuth Direct",
    shortName: "FDX",
    description:
      "Direct institution OAuth/FDX adapter slot for approved bank and brokerage integrations.",
    kind: "direct-api",
    maturity: "future",
    href: "/connect",
    capabilities: {
      accounts: true,
      transactions: true,
      holdings: true,
      liabilities: true,
      manualImport: false,
      automaticSync: true,
      reconciliation: true,
      repair: true,
      disconnect: true,
    },
  },
  async overview() {
    return futureOverview(fdxConnector.manifest);
  },
};

export const directOfxConnector: SolpientConnectorAdapter = {
  manifest: {
    id: "ofx-direct",
    name: "Direct OFX",
    shortName: "OFX",
    description:
      "Direct OFX download adapter slot using the same native parser and normalization model.",
    kind: "direct-legacy",
    maturity: "future",
    href: "/connect",
    capabilities: {
      accounts: true,
      transactions: true,
      holdings: true,
      liabilities: false,
      manualImport: false,
      automaticSync: true,
      reconciliation: true,
      repair: false,
      disconnect: true,
    },
  },
  async overview() {
    return futureOverview(directOfxConnector.manifest);
  },
};
