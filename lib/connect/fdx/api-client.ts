import type { FdxProviderProfile } from "@/lib/connect/fdx/providers";

function providerUrl(
  provider: FdxProviderProfile,
  path: string
) {
  if (!provider.apiBaseUrl) {
    throw new Error(
      `${provider.name} is missing an FDX API base URL.`
    );
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("FDX API paths must be relative.");
  }
  const base = new URL(provider.apiBaseUrl);
  const isLocal =
    base.hostname === "localhost" ||
    base.hostname === "127.0.0.1";
  if (base.protocol !== "https:" && !isLocal) {
    throw new Error(
      "FDX API base URL must use HTTPS outside local development."
    );
  }
  return new URL(
    path.replace(/^\//, ""),
    provider.apiBaseUrl.replace(/\/?$/, "/")
  );
}

export async function fdxGetJson({
  provider,
  accessToken,
  path,
}: {
  provider: FdxProviderProfile;
  accessToken: string;
  path: string;
}) {
  const url = providerUrl(provider, path);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Api-Version": "6.0",
    },
    redirect: "error",
    cache: "no-store",
  });

  const payload = (await response.json().catch(
    () => ({})
  )) as Record<string, unknown>;

  if (!response.ok) {
    const error = new Error(
      typeof payload.message === "string"
        ? payload.message
        : `FDX API request failed with HTTP ${response.status}.`
    );
    Object.assign(error, {
      status: response.status,
      code:
        typeof payload.code === "string"
          ? payload.code
          : null,
    });
    throw error;
  }

  return payload;
}
