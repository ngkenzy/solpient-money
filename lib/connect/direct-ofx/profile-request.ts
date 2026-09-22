import { randomUUID } from "node:crypto";
import type { DirectOfxInstitutionProfile } from "@/lib/connect/direct-ofx/institutions";

const ANONYMOUS = "anonymous" + "0".repeat(23);

function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tag(name: string, value?: string | null) {
  return value ? `<${name}>${escape(value)}</${name}>` : "";
}

function utcStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

export function buildAnonymousProfileRequest(
  profile: DirectOfxInstitutionProfile,
  now = new Date()
) {
  if (!profile.endpointUrl) {
    throw new Error(
      `${profile.name} does not have a Direct OFX endpoint profile.`
    );
  }

  const fi =
    profile.org && profile.fid
      ? `<FI>${tag("ORG", profile.org)}${tag(
          "FID",
          profile.fid
        )}</FI>`
      : "";

  return [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<SIGNONMSGSRQV1>",
    "<SONRQ>",
    tag("DTCLIENT", utcStamp(now)),
    tag("USERID", ANONYMOUS),
    tag("USERPASS", ANONYMOUS),
    tag("LANGUAGE", "ENG"),
    fi,
    tag("APPID", profile.appId),
    tag("APPVER", profile.appVer),
    "</SONRQ>",
    "</SIGNONMSGSRQV1>",
    "<PROFMSGSRQV1>",
    "<PROFTRNRQ>",
    tag("TRNUID", randomUUID()),
    "<PROFRQ>",
    tag("CLIENTROUTING", "MSGSET"),
    tag("DTPROFUP", "19900101"),
    "</PROFRQ>",
    "</PROFTRNRQ>",
    "</PROFMSGSRQV1>",
    "</OFX>",
  ].join("\r\n");
}
