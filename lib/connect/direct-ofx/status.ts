function tagValue(block: string, tag: string) {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([^<\\r\\n]*)`, "i")
  );
  return match?.[1]?.trim() ?? "";
}

export type OfxStatus = {
  code: string;
  severity: string;
  message: string;
};

export function parseOfxStatus(text: string): OfxStatus {
  const signon =
    text.match(/<SONRS(?:\s[^>]*)?>([\s\S]*?)(?:<\/SONRS>|$)/i)?.[1] ??
    text;
  const status =
    signon.match(/<STATUS(?:\s[^>]*)?>([\s\S]*?)(?:<\/STATUS>|$)/i)?.[1] ??
    signon;

  return {
    code: tagValue(status, "CODE") || "0",
    severity: tagValue(status, "SEVERITY") || "INFO",
    message: tagValue(status, "MESSAGE"),
  };
}

export function assertOfxSuccess(text: string) {
  const status = parseOfxStatus(text);
  if (status.code !== "0") {
    const error = new Error(
      status.message
        ? `OFX sign-on failed (${status.code}): ${status.message}`
        : `OFX sign-on failed with code ${status.code}.`
    );
    Object.assign(error, { ofxCode: status.code });
    throw error;
  }
  return status;
}
