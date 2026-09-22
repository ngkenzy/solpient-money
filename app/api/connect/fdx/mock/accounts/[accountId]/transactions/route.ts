import { NextResponse } from "next/server";
import { requireMockFdxAccess } from "@/lib/connect/fdx/mock-auth";
import {
  mockFdxAccounts,
  mockFdxTransactions,
} from "@/lib/connect/fdx/mock-data";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ accountId: string }>;
  }
) {
  try {
    requireMockFdxAccess(request);
    const { accountId } = await context.params;

    const account = mockFdxAccounts.find(
      (item) => item.accountId === accountId
    );

    if (!account) {
      return NextResponse.json(
        {
          code: "NOT_FOUND",
          message: "Sandbox account not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        accountId,
        transactions:
          mockFdxTransactions[accountId] ?? [],
        links: [],
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
