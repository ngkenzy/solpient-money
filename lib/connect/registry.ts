import type {
  ConnectorId,
  ConnectorOverview,
  ConnectorRuntimeContext,
  SolpientConnectorAdapter,
} from "@/lib/connect/sdk";
import { fileConnector } from "@/lib/connect/adapters/file";
import { plaidConnector } from "@/lib/connect/adapters/plaid";
import {
  directOfxConnector,
  fdxConnector,
} from "@/lib/connect/adapters/future";

export const connectorRegistry = [
  fileConnector,
  plaidConnector,
  fdxConnector,
  directOfxConnector,
] satisfies SolpientConnectorAdapter[];

const byId = new Map<ConnectorId, SolpientConnectorAdapter>();

for (const connector of connectorRegistry) {
  if (byId.has(connector.manifest.id)) {
    throw new Error(
      `Duplicate Solpient connector id: ${connector.manifest.id}`
    );
  }
  byId.set(connector.manifest.id, connector);
}

export function getConnector(
  id: ConnectorId
): SolpientConnectorAdapter {
  const connector = byId.get(id);
  if (!connector) {
    throw new Error(`Unknown Solpient connector: ${id}`);
  }
  return connector;
}

export function isConnectorId(value: string): value is ConnectorId {
  return byId.has(value as ConnectorId);
}

export async function getConnectorOverviews(
  context: ConnectorRuntimeContext
): Promise<ConnectorOverview[]> {
  return Promise.all(
    connectorRegistry.map((connector) =>
      connector.overview(context)
    )
  );
}

export async function runConnectorSync(
  id: ConnectorId,
  context: ConnectorRuntimeContext,
  instanceId?: string
) {
  const connector = getConnector(id);
  if (!connector.sync) {
    throw new Error(
      `${connector.manifest.name} does not support automatic sync.`
    );
  }
  return connector.sync(context, instanceId);
}


export async function runConnectorDisconnect(
  id: ConnectorId,
  context: ConnectorRuntimeContext,
  instanceId: string
) {
  const connector = getConnector(id);
  if (!connector.disconnect) {
    throw new Error(
      `${connector.manifest.name} does not support disconnect through the Connector SDK.`
    );
  }
  return connector.disconnect(context, instanceId);
}
