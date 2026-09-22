import { NextResponse } from "next/server";
import { requireMockFdxAccess } from "@/lib/connect/fdx/mock-auth";
import { mockFdxAccounts } from "@/lib/connect/fdx/mock-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = requireMockFdxAccess(request);
    return NextResponse.json(
      {
        institutionName: "Solpient FDX Sandbox",
        accounts: mockFdxAccounts,
        links: [],
        meta: {
          apiVersion: "6.0",
          synthetic: true,
          scope: token.scope,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        code: "UNAUTHORIZED",
        message:
          error instanceof Error
            ? error.message
            : "Unauthorized.",
      },
      { status: 401 }
    );
  }
}
