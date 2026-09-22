import {
  LOCAL_USER_EMAIL,
  LOCAL_USER_ID,
} from "@/lib/local-db/config";

export function getLocalIdentity() {
  return {
    userId: LOCAL_USER_ID,
    email: LOCAL_USER_EMAIL,
  };
}
