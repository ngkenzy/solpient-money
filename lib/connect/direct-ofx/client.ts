import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 6_000;
const TLS_TIMEOUT_MS = 10_000;
const RESPONSE_TIMEOUT_MS = 20_000;
const MAX_ADDRESS_ATTEMPTS = 6;

type PublicAddress = {
  address: string;
  family: 4 | 6;
};

function isPrivateV4(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((x) => !Number.isInteger(x))
  ) {
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
    throw new Error(
      "OFX endpoint must be a valid HTTPS URL."
    );
  }

  if (url.protocol !== "https:") {
    throw new Error("Direct OFX requires HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error(
      "Do not put credentials in the OFX endpoint URL."
    );
  }
  if (url.port && url.port !== "443") {
    throw new Error(
      "Direct OFX only permits HTTPS port 443."
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(
      "Local/private OFX endpoints are not permitted."
    );
  }

  const ipVersion = isIP(hostname);
  if (
    (ipVersion === 4 && isPrivateV4(hostname)) ||
    (ipVersion === 6 && isPrivateV6(hostname))
  ) {
    throw new Error(
      "Private-network OFX endpoints are not permitted."
    );
  }

  return url;
}

export function orderPublicAddresses(
  addresses: PublicAddress[]
) {
  return [...addresses]
    .sort((a, b) => {
      if (a.family !== b.family) {
        return a.family === 4 ? -1 : 1;
      }
      return a.address.localeCompare(b.address);
    })
    .slice(0, MAX_ADDRESS_ATTEMPTS);
}

export async function resolvePublicAddresses(
  url: URL
): Promise<PublicAddress[]> {
  const ipVersion = isIP(url.hostname);

  if (ipVersion === 4 || ipVersion === 6) {
    return [
      {
        address: url.hostname,
        family: ipVersion,
      },
    ];
  }

  const resolved = await lookup(url.hostname, {
    all: true,
    verbatim: true,
  });

  if (!resolved.length) {
    throw new Error(
      "OFX endpoint hostname did not resolve."
    );
  }

  const unique = new Map<string, PublicAddress>();

  for (const record of resolved) {
    if (record.family !== 4 && record.family !== 6) {
      continue;
    }

    if (
      (record.family === 4 &&
        isPrivateV4(record.address)) ||
      (record.family === 6 &&
        isPrivateV6(record.address))
    ) {
      throw new Error(
        "OFX endpoint resolved to a private or reserved network address."
      );
    }

    unique.set(
      `${record.family}:${record.address}`,
      {
        address: record.address,
        family: record.family,
      }
    );
  }

  const addresses = orderPublicAddresses(
    Array.from(unique.values())
  );

  if (!addresses.length) {
    throw new Error(
      "OFX endpoint did not resolve to a usable public IP address."
    );
  }

  return addresses;
}

function attemptLabel(
  record: PublicAddress,
  index: number
) {
  return `${record.family === 4 ? "IPv4" : "IPv6"} attempt ${index + 1}`;
}

async function postToAddress({
  url,
  body,
  record,
  index,
}: {
  url: URL;
  body: string;
  record: PublicAddress;
  index: number;
}) {
  const label = attemptLabel(record, index);

  return new Promise<string>((resolve, reject) => {
    let stage: "connect" | "tls" | "response" =
      "connect";
    let stageTimer: ReturnType<typeof setTimeout> | null =
      null;
    let settled = false;

    function clearStageTimer() {
      if (stageTimer) {
        clearTimeout(stageTimer);
        stageTimer = null;
      }
    }

    function rejectOnce(error: Error) {
      if (settled) return;
      settled = true;
      clearStageTimer();
      reject(error);
    }

    function armStageTimer(
      timeoutMs: number,
      currentStage: typeof stage
    ) {
      clearStageTimer();
      stageTimer = setTimeout(() => {
        request.destroy(
          new Error(
            `${label} timed out during ${currentStage}.`
          )
        );
      }, timeoutMs);
    }

    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: record.address,
        family: record.family,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        servername: isIP(url.hostname)
          ? undefined
          : url.hostname,
        rejectUnauthorized: true,
        checkServerIdentity: (_hostname, cert) =>
          checkServerIdentity(url.hostname, cert),
        headers: {
          Host: url.host,
          "Content-Type": "application/x-ofx",
          Accept:
            "application/x-ofx,text/plain,*/*",
          "User-Agent": "Solpient-Money/1.3",
          "Content-Length": Buffer.byteLength(body),
          Connection: "close",
        },
      },
      (response) => {
        stage = "response";
        armStageTimer(
          RESPONSE_TIMEOUT_MS,
          "response"
        );

        const status = response.statusCode ?? 0;
        const contentLength = Number(
          response.headers["content-length"] ?? 0
        );

        if (status < 200 || status >= 300) {
          response.resume();
          rejectOnce(
            new Error(
              `${label} reached the server but received HTTP ${status}.`
            )
          );
          return;
        }

        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_RESPONSE_BYTES
        ) {
          response.resume();
          rejectOnce(
            new Error(
              `${label} response exceeded the 5 MB safety limit.`
            )
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
                `${label} response exceeded the 5 MB safety limit.`
              )
            );
            return;
          }
          chunks.push(Buffer.from(chunk));
        });

        response.on("end", () => {
          if (settled) return;
          settled = true;
          clearStageTimer();
          resolve(
            Buffer.concat(chunks).toString("utf8")
          );
        });
      }
    );

    request.on("socket", (socket) => {
      stage = "connect";
      armStageTimer(
        CONNECT_TIMEOUT_MS,
        "connect"
      );

      socket.once("connect", () => {
        stage = "tls";
        armStageTimer(
          TLS_TIMEOUT_MS,
          "tls"
        );
      });

      socket.once("secureConnect", () => {
        stage = "response";
        armStageTimer(
          RESPONSE_TIMEOUT_MS,
          "response"
        );
      });
    });

    request.on("error", (error) => {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error
          ? String(
              (error as { code?: unknown }).code ??
                ""
            )
          : "";
      const suffix = code ? ` [${code}]` : "";

      rejectOnce(
        new Error(
          `${label} ${stage} failed${suffix}: ${error.message}`
        )
      );
    });

    request.write(body);
    request.end();
  });
}

export async function postDirectOfx(
  endpoint: string,
  body: string
) {
  const url = validateDirectOfxUrl(endpoint);
  const addresses =
    await resolvePublicAddresses(url);

  const failures: string[] = [];

  for (
    let index = 0;
    index < addresses.length;
    index += 1
  ) {
    const record = addresses[index];

    try {
      return await postToAddress({
        url,
        body,
        record,
        index,
      });
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : `${attemptLabel(
              record,
              index
            )} failed.`
      );
    }
  }

  throw new Error(
    `All ${addresses.length} validated OFX network route${
      addresses.length === 1 ? "" : "s"
    } failed. ${failures.join(" | ")}`
  );
}
