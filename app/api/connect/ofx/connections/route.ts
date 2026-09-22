import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";
import { getDirectOfxStatus } from "@/lib/connect/direct-ofx/config";
import { validateDirectOfxUrl } from "@/lib/connect/direct-ofx/client";
import {
  loadDirectOfxSecret,
  storeDirectOfxSecret,
} from "@/lib/connect/direct-ofx/secrets";
import type {
  DirectOfxAuthMode,
  DirectOfxMessageSet,
  DirectOfxSecretPayload,
} from "@/lib/connect/direct-ofx/types";

export const dynamic = "force-dynamic";

const messageSets = new Set<DirectOfxMessageSet>([
  "banking",
  "credit_card",
  "investment",
]);
const authModes = new Set<DirectOfxAuthMode>([
  "app_password",
  "userkey",
]);
const accountTypes = new Set([
  "CHECKING",
  "SAVINGS",
  "MONEYMRKT",
  "CREDITLINE",
  "CD",
]);

function textValue(value: unknown, max: number) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

export async function POST(request: Request) {
  let createdId: string | null = null;

  try {
    if (!getDirectOfxStatus().configured) {
      return NextResponse.json(
        {
          error:
            "Set CONNECT_SECRET_ENCRYPTION_KEY before creating a Direct OFX connection.",
        },
        { status: 503 }
      );
    }

    const { supabase, householdId } =
      await getConnectHouseholdContext();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.credentialIsDedicated !== true) {
      return NextResponse.json(
        {
          error:
            "Direct OFX requires an institution-issued Direct Connect/app credential or token. Do not enter your normal online-banking password.",
        },
        { status: 400 }
      );
    }

    const institutionName = textValue(body.institutionName, 160);
    const endpointUrl = textValue(body.endpointUrl, 500);
    const org = textValue(body.org, 64) || null;
    const fid = textValue(body.fid, 64) || null;
    const messageSet = textValue(
      body.messageSet,
      32
    ) as DirectOfxMessageSet;
    const accountType = textValue(body.accountType, 32);
    const appId = textValue(body.appId, 32) || "SOLPIENT";
    const appVer = textValue(body.appVer, 16) || "0100";
    const authMode = textValue(
      body.authMode,
      32
    ) as DirectOfxAuthMode;

    const userId = textValue(body.userId, 171);
    const credential = textValue(body.credential, 512);
    const accountId = textValue(body.accountId, 256);
    const bankId = textValue(body.bankId, 64);
    const brokerId = textValue(body.brokerId, 128);
    const clientUid = textValue(body.clientUid, 128);
    const authToken = textValue(body.authToken, 512);

    if (!institutionName || !endpointUrl) {
      throw new ConnectAuthError(
        "Institution name and OFX endpoint are required.",
        400
      );
    }
    validateDirectOfxUrl(endpointUrl);

    if (!messageSets.has(messageSet)) {
      throw new ConnectAuthError("Unsupported OFX message set.", 400);
    }
    if (!authModes.has(authMode)) {
      throw new ConnectAuthError("Unsupported OFX authentication mode.", 400);
    }
    if (!userId || !credential || !accountId) {
      throw new ConnectAuthError(
        "User ID, Direct Connect credential, and account ID are required.",
        400
      );
    }
    if ((org && !fid) || (!org && fid)) {
      throw new ConnectAuthError(
        "OFX ORG and FID must be provided together.",
        400
      );
    }
    if (messageSet === "banking") {
      if (!bankId) {
        throw new ConnectAuthError(
          "Banking OFX connections require a BANKID/routing identifier.",
          400
        );
      }
      if (!accountTypes.has(accountType || "CHECKING")) {
        throw new ConnectAuthError("Unsupported OFX bank account type.", 400);
      }
    }
    if (messageSet === "investment" && !brokerId) {
      throw new ConnectAuthError(
        "Investment OFX connections require a BROKERID.",
        400
      );
    }

    const { data: connection, error } = await supabase
      .from("direct_ofx_connections")
      .insert({
        household_id: householdId,
        institution_name: institutionName,
        endpoint_url: endpointUrl,
        org,
        fid,
        message_set: messageSet,
        account_type:
          messageSet === "banking"
            ? accountType || "CHECKING"
            : null,
        account_mask: accountId.slice(-4),
        app_id: appId,
        app_ver: appVer,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !connection) {
      throw new Error(
        `Unable to create Direct OFX connection: ${error?.message ?? "unknown error"}`
      );
    }

    createdId = String(connection.id);

    const secret: DirectOfxSecretPayload = {
      authMode,
      userId,
      credential,
      accountId,
      bankId: bankId || undefined,
      brokerId: brokerId || undefined,
      clientUid: clientUid || undefined,
      authToken: authToken || undefined,
    };

    await storeDirectOfxSecret(supabase, createdId, secret);

    return NextResponse.json({
      ok: true,
      connectionId: createdId,
    });
  } catch (error) {
    if (createdId) {
      try {
        const { supabase, householdId } =
          await getConnectHouseholdContext();
        await supabase
          .from("direct_ofx_connections")
          .delete()
          .eq("id", createdId)
          .eq("household_id", householdId);
      } catch {
        // Preserve the original error.
      }
    }

    const status =
      error instanceof ConnectAuthError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create Direct OFX connection.",
      },
      { status }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    if (!getDirectOfxStatus().configured) {
      return NextResponse.json(
        {
          error:
            "Set CONNECT_SECRET_ENCRYPTION_KEY before updating Direct OFX credentials.",
        },
        { status: 503 }
      );
    }

    const { supabase, householdId } =
      await getConnectHouseholdContext();
    const body = (await request.json()) as Record<string, unknown>;
    const connectionId = textValue(body.connectionId, 80);

    if (!connectionId) {
      throw new ConnectAuthError("Missing connection id.", 400);
    }
    if (body.credentialIsDedicated !== true) {
      throw new ConnectAuthError(
        "Confirm that the credential is institution-issued for Direct Connect/app access.",
        400
      );
    }

    const { data: connection, error } = await supabase
      .from("direct_ofx_connections")
      .select("id")
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .single();

    if (error || !connection) {
      throw new ConnectAuthError(
        "Direct OFX connection not found.",
        404
      );
    }

    const current = await loadDirectOfxSecret(
      supabase,
      connectionId
    );
    const next: DirectOfxSecretPayload = {
      ...current,
    };

    const authMode = textValue(body.authMode, 32);
    if (authMode) {
      if (!authModes.has(authMode as DirectOfxAuthMode)) {
        throw new ConnectAuthError(
          "Unsupported OFX authentication mode.",
          400
        );
      }
      next.authMode = authMode as DirectOfxAuthMode;
    }

    const userId = textValue(body.userId, 171);
    const credential = textValue(body.credential, 512);
    const clientUid = textValue(body.clientUid, 128);
    const authToken = textValue(body.authToken, 512);

    if (userId) next.userId = userId;
    if (credential) next.credential = credential;
    if (clientUid) next.clientUid = clientUid;
    if (authToken) next.authToken = authToken;

    await storeDirectOfxSecret(supabase, connectionId, next);

    await supabase
      .from("direct_ofx_connections")
      .update({
        status: "active",
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("household_id", householdId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof ConnectAuthError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update Direct OFX credentials.",
      },
      { status }
    );
  }
}
