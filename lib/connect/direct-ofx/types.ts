export type DirectOfxMessageSet =
  | "banking"
  | "credit_card"
  | "investment";

export type DirectOfxAuthMode =
  | "app_password"
  | "userkey";

export type DirectOfxConnectionRow = {
  id: string;
  household_id: string;
  institution_name: string;
  endpoint_url: string;
  org?: string | null;
  fid?: string | null;
  message_set: DirectOfxMessageSet;
  account_type?:
    | "CHECKING"
    | "SAVINGS"
    | "MONEYMRKT"
    | "CREDITLINE"
    | "CD"
    | null;
  account_mask?: string | null;
  app_id: string;
  app_ver: string;
  status: "active" | "needs_update" | "error" | "disconnected";
  last_synced_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
};

export type DirectOfxSecretPayload = {
  authMode: DirectOfxAuthMode;
  userId: string;
  credential: string;
  accountId: string;
  bankId?: string;
  brokerId?: string;
  clientUid?: string;
  authToken?: string;
};
