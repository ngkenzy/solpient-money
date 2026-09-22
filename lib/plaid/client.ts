import { getPlaidServerConfig } from "@/lib/plaid/config";

export class PlaidApiError extends Error {
  status: number;
  errorCode?: string;
  errorType?: string;
  requestId?: string;

  constructor(
    message: string,
    status: number,
    detail?: {
      error_code?: string;
      error_type?: string;
      request_id?: string;
    }
  ) {
    super(message);
    this.name = "PlaidApiError";
    this.status = status;
    this.errorCode = detail?.error_code;
    this.errorType = detail?.error_type;
    this.requestId = detail?.request_id;
  }
}

export async function plaidPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const config = getPlaidServerConfig();

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": config.clientId,
      "PLAID-SECRET": config.secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new PlaidApiError(
      String(payload.error_message ?? `Plaid request failed: ${path}`),
      response.status,
      {
        error_code:
          typeof payload.error_code === "string" ? payload.error_code : undefined,
        error_type:
          typeof payload.error_type === "string" ? payload.error_type : undefined,
        request_id:
          typeof payload.request_id === "string" ? payload.request_id : undefined,
      }
    );
  }

  return payload as T;
}
