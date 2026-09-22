import { NextResponse } from "next/server";
import { getConnectHouseholdContext } from "@/lib/connect/auth";
import {
  getDirectOfxInstitutionProfile,
} from "@/lib/connect/direct-ofx/institutions";
import { buildAnonymousProfileRequest } from "@/lib/connect/direct-ofx/profile-request";
import { parseDirectOfxProfileResponse } from "@/lib/connect/direct-ofx/profile-response";
import { postDirectOfx } from "@/lib/connect/direct-ofx/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let targetHost: string | null = null;
  try {
    await getConnectHouseholdContext();

    const body = (await request.json()) as {
      profileId?: string;
    };
    const profileId =
      typeof body.profileId === "string"
        ? body.profileId.trim()
        : "";

    const profile = getDirectOfxInstitutionProfile(profileId);

    if (!profile) {
      return NextResponse.json(
        { error: "Unknown Direct OFX institution profile." },
        { status: 404 }
      );
    }

    const probeEndpoint =
      profile.profileEndpointUrl ?? profile.endpointUrl;

    if (
      profile.status !== "candidate" ||
      !probeEndpoint
    ) {
      return NextResponse.json(
        {
          error:
            profile.status === "unsupported"
              ? `${profile.name} is marked unsupported for Direct OFX.`
              : `${profile.name} does not have a probeable OFX endpoint.`,
        },
        { status: 409 }
      );
    }

    targetHost = new URL(probeEndpoint).hostname;
    const requestBody = buildAnonymousProfileRequest(profile);
    const response = await postDirectOfx(
      probeEndpoint,
      requestBody
    );
    const probe = parseDirectOfxProfileResponse(response);

    return NextResponse.json({
      ok: probe.accepted,
      profile: {
        id: profile.id,
        name: profile.name,
        profileEndpointHost: targetHost,
        transactionEndpointHost: profile.endpointUrl
          ? new URL(profile.endpointUrl).hostname
          : null,
        fid: profile.fid ?? null,
        org: profile.org ?? null,
        brokerId: profile.brokerId ?? null,
        appId: profile.appId,
        appVer: profile.appVer,
      },
      probe,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Direct OFX profile probe failed.";
    const timeout = /timed out/i.test(message);

    return NextResponse.json(
      {
        error: targetHost
          ? `${targetHost}: ${message}`
          : message,
        stage: "profile_probe",
        targetHost,
      },
      { status: timeout ? 504 : 502 }
    );
  }
}
