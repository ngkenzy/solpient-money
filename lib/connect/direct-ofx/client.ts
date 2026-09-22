import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

function isPrivateV4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((x) => !Number.isInteger(x))) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(address: string) {
  const value = address.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff")
  );
}

export function validateDirectOfxUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("OFX endpoint must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Direct OFX requires HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Do not put credentials in the OFX endpoint URL.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Direct OFX only permits HTTPS port 443.");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local/private OFX endpoints are not permitted.");
  }

  const ipVersion = isIP(hostname);
  if (
    (ipVersion === 4 && isPrivateV4(hostname)) ||
    (ipVersion === 6 && isPrivateV6(hostname))
  ) {
    throw new Error("Private-network OFX endpoints are not permitted.");
  }

  return url;
}

async function resolvePublicAddress(url: URL) {
  const ipVersion = isIP(url.hostname);
  if (ipVersion) {
    return { address: url.hostname, family: ipVersion };
  }

  const resolved = await lookup(url.hostname, { all: true });
  if (!resolved.length) {
    throw new Error("OFX endpoint hostname did not resolve.");
  }

  for (const record of resolved) {
    if (
      (record.family === 4 && isPrivateV4(record.address)) ||
      (record.family === 6 && isPrivateV6(record.address))
    ) {
      throw new Error(
        "OFX endpoint resolved to a private or reserved network address."
      );
    }
  }

  return resolved[0];
}

export async function postDirectOfx(
  endpoint: string,
  body: string
) {
  const url = validateDirectOfxUrl(endpoint);
  const resolved = await resolvePublicAddress(url);

  return new Promise<string>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: resolved.address,
        family: resolved.family,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        servername: isIP(url.hostname) ? undefined : url.hostname,
        rejectUnauthorized: true,
        checkServerIdentity: (_hostname, cert) =>
          checkServerIdentity(url.hostname, cert),
        headers: {
          Host: url.host,
          "Content-Type": "application/x-ofx",
          Accept: "application/x-ofx,text/plain,*/*",
          "User-Agent": "Solpient-Money/1.3",
          "Content-Length": Buffer.byteLength(body),
          Connection: "close",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentLength = Number(
          response.headers["content-length"] ?? 0
        );

        if (status < 200 || status >= 300) {
          response.resume();
          reject(
            new Error(
              `OFX endpoint returned HTTP ${status}.`
            )
          );
          return;
        }

        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_RESPONSE_BYTES
        ) {
          response.resume();
          reject(
            new Error("OFX response exceeded the 5 MB safety limit.")
          );
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(
              new Error(
                "OFX response exceeded the 5 MB safety limit."
              )
            );
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error("OFX endpoint timed out after 20 seconds.")
      );
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}
