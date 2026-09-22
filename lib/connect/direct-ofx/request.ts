import { randomUUID } from "node:crypto";
import type {
  DirectOfxConnectionRow,
  DirectOfxSecretPayload,
} from "@/lib/connect/direct-ofx/types";

function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ofxDate(date: Date) {
  const pad = (value: number) =>
    String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function tag(name: string, value?: string | null) {
  return value ? `<${name}>${escape(value)}</${name}>` : "";
}

function accountRequest(
  connection: DirectOfxConnectionRow,
  secret: DirectOfxSecretPayload,
  startDate: Date
) {
  const transactionRange =
    `<INCTRAN><DTSTART>${ofxDate(startDate)}</DTSTART><INCLUDE>Y</INCLUDE></INCTRAN>`;

  if (connection.message_set === "credit_card") {
    return [
      "<CREDITCARDMSGSRQV1>",
      "<CCSTMTTRNRQ>",
      tag("TRNUID", randomUUID()),
      "<CCSTMTRQ>",
      "<CCACCTFROM>",
      tag("ACCTID", secret.accountId),
      "</CCACCTFROM>",
      transactionRange,
      "</CCSTMTRQ>",
      "</CCSTMTTRNRQ>",
      "</CREDITCARDMSGSRQV1>",
    ].join("");
  }

  if (connection.message_set === "investment") {
    return [
      "<INVSTMTMSGSRQV1>",
      "<INVSTMTTRNRQ>",
      tag("TRNUID", randomUUID()),
      "<INVSTMTRQ>",
      "<INVACCTFROM>",
      tag("BROKERID", secret.brokerId),
      tag("ACCTID", secret.accountId),
      "</INVACCTFROM>",
      transactionRange,
      "<INCOO>Y</INCOO>",
      "</INVSTMTRQ>",
      "</INVSTMTTRNRQ>",
      "</INVSTMTMSGSRQV1>",
    ].join("");
  }

  return [
    "<BANKMSGSRQV1>",
    "<STMTTRNRQ>",
    tag("TRNUID", randomUUID()),
    "<STMTRQ>",
    "<BANKACCTFROM>",
    tag("BANKID", secret.bankId),
    tag("ACCTID", secret.accountId),
    tag("ACCTTYPE", connection.account_type || "CHECKING"),
    "</BANKACCTFROM>",
    transactionRange,
    "</STMTRQ>",
    "</STMTTRNRQ>",
    "</BANKMSGSRQV1>",
  ].join("");
}

export function buildDirectOfxRequest({
  connection,
  secret,
  days = 90,
  now = new Date(),
}: {
  connection: DirectOfxConnectionRow;
  secret: DirectOfxSecretPayload;
  days?: number;
  now?: Date;
}) {
  const startDate = new Date(
    now.getTime() - Math.max(1, Math.min(days, 730)) * 86_400_000
  );

  const fi =
    connection.org && connection.fid
      ? `<FI>${tag("ORG", connection.org)}${tag(
          "FID",
          connection.fid
        )}</FI>`
      : "";

  const credential =
    secret.authMode === "userkey"
      ? tag("USERKEY", secret.credential)
      : tag("USERPASS", secret.credential);

  const signon = [
    "<SIGNONMSGSRQV1>",
    "<SONRQ>",
    tag("DTCLIENT", ofxDate(now)),
    tag("USERID", secret.userId),
    credential,
    tag("LANGUAGE", "ENG"),
    fi,
    tag("APPID", connection.app_id),
    tag("APPVER", connection.app_ver),
    tag("CLIENTUID", secret.clientUid),
    tag("AUTHTOKEN", secret.authToken),
    "</SONRQ>",
    "</SIGNONMSGSRQV1>",
  ].join("");

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
    signon,
    accountRequest(connection, secret, startDate),
    "</OFX>",
  ].join("\r\n");
}
