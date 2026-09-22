import { parseOfxStatus } from "./status";

function tagValue(block: string, tag: string) {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([^<\\r\\n]*)`, "i")
  );
  return match?.[1]?.trim() ?? "";
}

export type DirectOfxProbeResult = {
  reachable: boolean;
  ofxResponse: boolean;
  accepted: boolean;
  code: string | null;
  severity: string | null;
  message: string | null;
  financialInstitutionName: string | null;
  profileDate: string | null;
  supportsBanking: boolean;
  supportsCreditCard: boolean;
  supportsInvestment: boolean;
  advertisedUrls: string[];
};

export function parseDirectOfxProfileResponse(
  text: string
): DirectOfxProbeResult {
  const ofxResponse = /<OFX(?:\s|>)/i.test(text);
  if (!ofxResponse) {
    return {
      reachable: true,
      ofxResponse: false,
      accepted: false,
      code: null,
      severity: null,
      message: "Endpoint responded, but not with an OFX document.",
      financialInstitutionName: null,
      profileDate: null,
      supportsBanking: false,
      supportsCreditCard: false,
      supportsInvestment: false,
      advertisedUrls: [],
    };
  }

  const status = parseOfxStatus(text);
  const urls = Array.from(
    text.matchAll(/<URL(?:\s[^>]*)?>([^<\r\n]*)/gi),
    (match) => match[1].trim()
  ).filter(Boolean);

  return {
    reachable: true,
    ofxResponse: true,
    accepted: status.code === "0",
    code: status.code,
    severity: status.severity,
    message: status.message || null,
    financialInstitutionName:
      tagValue(text, "FINAME") || null,
    profileDate: tagValue(text, "DTPROFUP") || null,
    supportsBanking:
      /<BANKMSGSETV1(?:\s|>)/i.test(text) ||
      /<BANKMSGSET(?:\s|>)/i.test(text),
    supportsCreditCard:
      /<CREDITCARDMSGSETV1(?:\s|>)/i.test(text) ||
      /<CREDITCARDMSGSET(?:\s|>)/i.test(text),
    supportsInvestment:
      /<INVSTMTMSGSETV1(?:\s|>)/i.test(text) ||
      /<INVSTMTMSGSET(?:\s|>)/i.test(text),
    advertisedUrls: Array.from(new Set(urls)).slice(0, 12),
  };
}
