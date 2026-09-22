export function getDirectOfxStatus() {
  return {
    configured: Boolean(
      process.env.CONNECT_SECRET_ENCRYPTION_KEY?.trim()
    ),
  };
}

export function getConnectSecretKey() {
  const value = process.env.CONNECT_SECRET_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error(
      "Direct OFX secret encryption is not configured. Set CONNECT_SECRET_ENCRYPTION_KEY."
    );
  }
  return value;
}
