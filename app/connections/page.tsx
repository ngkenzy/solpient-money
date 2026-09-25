import PageHeader from "@/components/PageHeader";
import ConnectorRegistryPanel from "@/components/ConnectorRegistryPanel";
import { requireActiveHousehold } from "@/lib/money-auth";
import { getConnectorOverviews } from "@/lib/connect/registry";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const { supabase, householdId } = await requireActiveHousehold();
  const connectorOverviews = await getConnectorOverviews({
    supabase,
    householdId,
  });

  const instanceCount = connectorOverviews.reduce(
    (sum, overview) => sum + overview.instances.length,
    0
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="CONNECTOR SDK"
        title="Connections."
        description="File imports and Direct OFX connections, managed through the shared Connector SDK. Everything runs locally; credentials stay encrypted on this Mac."
        action={
          <span className="small-muted">
            {instanceCount} active instance{instanceCount === 1 ? "" : "s"}
          </span>
        }
      />

      <ConnectorRegistryPanel overviews={connectorOverviews} />
    </div>
  );
}
