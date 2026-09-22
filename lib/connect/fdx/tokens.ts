import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptConnectorSecret,
  encryptConnectorSecret,
} from "@/lib/connect/secret-crypto";

export type OAuthFdxTokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType: string;
  expiresAt?: string | null;
  scope?: string | null;
};

type TokenRow = {
  access_ciphertext: string;
  access_iv: string;
  access_tag: string;
  refresh_ciphertext?: string | null;
  refresh_iv?: string | null;
  refresh_tag?: string | null;
  token_type?: string | null;
  expires_at?: string | null;
  scope?: string | null;
};

export async function storeOAuthFdxTokens(
  supabase: SupabaseClient,
  connectionId: string,
  tokens: OAuthFdxTokenSet
) {
  const access = encryptConnectorSecret(tokens.accessToken);
  const refresh = tokens.refreshToken
    ? encryptConnectorSecret(tokens.refreshToken)
    : null;

  const { error } = await supabase.rpc(
    "store_oauth_fdx_tokens",
    {
      p_connection_id: connectionId,
      p_access_ciphertext: access.ciphertext,
      p_access_iv: access.iv,
      p_access_tag: access.tag,
      p_refresh_ciphertext:
        refresh?.ciphertext ?? null,
      p_refresh_iv: refresh?.iv ?? null,
      p_refresh_tag: refresh?.tag ?? null,
      p_token_type: tokens.tokenType || "Bearer",
      p_expires_at: tokens.expiresAt ?? null,
      p_scope: tokens.scope ?? null,
    }
  );

  if (error) {
    throw new Error(
      `Unable to store OAuth/FDX tokens: ${error.message}`
    );
  }
}

export async function loadOAuthFdxTokens(
  supabase: SupabaseClient,
  connectionId: string
): Promise<OAuthFdxTokenSet> {
  const { data, error } = await supabase.rpc(
    "get_oauth_fdx_tokens",
    { p_connection_id: connectionId }
  );

  if (error) {
    throw new Error(
      `Unable to load OAuth/FDX tokens: ${error.message}`
    );
  }

  const row = (
    Array.isArray(data) ? data[0] : data
  ) as TokenRow | undefined;

  if (!row) {
    throw new Error("OAuth/FDX token vault entry not found.");
  }

  return {
    accessToken: decryptConnectorSecret({
      ciphertext: row.access_ciphertext,
      iv: row.access_iv,
      tag: row.access_tag,
    }),
    refreshToken:
      row.refresh_ciphertext &&
      row.refresh_iv &&
      row.refresh_tag
        ? decryptConnectorSecret({
            ciphertext: row.refresh_ciphertext,
            iv: row.refresh_iv,
            tag: row.refresh_tag,
          })
        : null,
    tokenType: row.token_type || "Bearer",
    expiresAt: row.expires_at ?? null,
    scope: row.scope ?? null,
  };
}

export async function deleteOAuthFdxTokens(
  supabase: SupabaseClient,
  connectionId: string
) {
  const { error } = await supabase.rpc(
    "delete_oauth_fdx_tokens",
    { p_connection_id: connectionId }
  );
  if (error) {
    throw new Error(
      `Unable to delete OAuth/FDX tokens: ${error.message}`
    );
  }
}
