import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { getPlaidServerConfig } from "@/lib/plaid/config";

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function encryptionKey() {
  const raw = getPlaidServerConfig().encryptionKey;
  const key = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "PLAID_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters or base64 for 32 bytes)."
    );
  }

  return key;
}

export function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(secret.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
