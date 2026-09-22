import { NextResponse } from "next/server";
import { createMockFdxToken } from "@/lib/connect/fdx/mock-token";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validateRequest(url: URL) {
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri =
    url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const scope = url.searchParams.get("scope") ?? "";
  const challenge =
    url.searchParams.get("code_challenge") ?? "";
  const method =
    url.searchParams.get("code_challenge_method");

  if (
    clientId !== "solpient-money-local" ||
    !redirectUri ||
    !state ||
    !challenge ||
    method !== "S256"
  ) {
    throw new Error(
      "Invalid Solpient FDX Sandbox authorization request."
    );
  }

  const redirect = new URL(redirectUri);
  if (
    redirect.origin !== url.origin ||
    redirect.pathname !==
      "/api/connect/fdx/callback"
  ) {
    throw new Error(
      "Sandbox redirect URI is not allowed."
    );
  }

  return {
    clientId,
    redirectUri,
    state,
    scope,
    challenge,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const values = validateRequest(url);

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Solpient FDX Sandbox Consent</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#f4f7fa;color:#17324d;margin:0;padding:48px}
main{max-width:640px;margin:auto;background:white;border:1px solid #dce5ee;border-radius:16px;padding:28px;box-shadow:0 16px 50px rgba(32,61,90,.08)}
small{color:#73869a}h1{font-size:24px}p{line-height:1.55;color:#526b82}
.scope{padding:12px;background:#f7faff;border-radius:10px;font-size:13px;margin:18px 0}
button{border:0;border-radius:9px;background:#1f6fc8;color:white;padding:11px 16px;font-weight:700;cursor:pointer}
</style>
</head>
<body><main>
<small>SOLPIENT CONNECT V1.4 · LOCAL TEST PROVIDER</small>
<h1>Authorize synthetic FDX data?</h1>
<p>This is a Solpient-owned sandbox. No bank account, password, or external financial institution is involved.</p>
<div class="scope">Requested scopes: ${escapeHtml(values.scope)}</div>
<form method="post">
<input type="hidden" name="client_id" value="${escapeHtml(values.clientId)}">
<input type="hidden" name="redirect_uri" value="${escapeHtml(values.redirectUri)}">
<input type="hidden" name="state" value="${escapeHtml(values.state)}">
<input type="hidden" name="scope" value="${escapeHtml(values.scope)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(values.challenge)}">
<button type="submit">Authorize sandbox data</button>
</form>
</main></body></html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid sandbox authorization request.",
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const form = await request.formData();
    const clientId = String(
      form.get("client_id") ?? ""
    );
    const redirectUri = String(
      form.get("redirect_uri") ?? ""
    );
    const state = String(
      form.get("state") ?? ""
    );
    const scope = String(
      form.get("scope") ?? ""
    );
    const challenge = String(
      form.get("code_challenge") ?? ""
    );

    const validationUrl = new URL(
      request.url
    );
    validationUrl.searchParams.set(
      "client_id",
      clientId
    );
    validationUrl.searchParams.set(
      "redirect_uri",
      redirectUri
    );
    validationUrl.searchParams.set(
      "state",
      state
    );
    validationUrl.searchParams.set(
      "scope",
      scope
    );
    validationUrl.searchParams.set(
      "code_challenge",
      challenge
    );
    validationUrl.searchParams.set(
      "code_challenge_method",
      "S256"
    );
    validateRequest(validationUrl);

    const code = createMockFdxToken({
      kind: "code",
      clientId,
      scope,
      redirectUri,
      codeChallenge: challenge,
      exp:
        Math.floor(Date.now() / 1000) + 300,
    });

    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", state);
    return NextResponse.redirect(redirect);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sandbox authorization failed.",
      },
      { status: 400 }
    );
  }
}
