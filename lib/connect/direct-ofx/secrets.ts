import type { SolpientDbClient } from "@/lib/local-db/client";
import {
  decryptConnectorSecret,
  encryptConnectorSecret,
} from "@/lib/connect/secret-crypto";
import type { DirectOfxSecretPayload } from "@/lib/connect/direct-ofx/types";

type SecretRow = {
  secret_ciphertext: string;
  secret_iv: string;
  secret_tag: string;
};

export async function storeDirectOfxSecret(
  supabase: SolpientDbClient,
  connectionId: string,
  payload: DirectOfxSecretPayload
) {
  const encrypted = encryptConnectorSecret(JSON.stringify(payload));
  const { error } = await supabase.rpc("store_direct_ofx_secret", {
    p_connection_id: connectionId,
    p_secret_ciphertext: encrypted.ciphertext,
    p_secret_iv: encrypted.iv,
    p_secret_tag: encrypted.tag,
  });
  if (error) {
    throw new Error(
      `Unable to store Direct OFX credential: ${error.message}`
    );
  }
}

export async function loadDirectOfxSecret(
  supabase: SolpientDbClient,
  connectionId: string
) {
  const { data, error } = await supabase.rpc(
    "get_direct_ofx_secret",
    { p_connection_id: connectionId }
  );
  if (error) {
    throw new Error(
      `Unable to read Direct OFX credential: ${error.message}`
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | SecretRow
    | undefined;
  if (!row) {
    throw new Error("Direct OFX credential not found.");
  }

  const plaintext = decryptConnectorSecret({
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    tag: row.secret_tag,
  });
  return JSON.parse(plaintext) as DirectOfxSecretPayload;
}

export async function deleteDirectOfxSecret(
  supabase: SolpientDbClient,
  connectionId: string
) {
  const { error } = await supabase.rpc(
    "delete_direct_ofx_secret",
    { p_connection_id: connectionId }
  );
  if (error) {
    throw new Error(
      `Unable to delete Direct OFX credential: ${error.message}`
    );
  }
}
