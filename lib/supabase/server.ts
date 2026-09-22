import { createLocalDbClient } from "@/lib/local-db/client";

export async function createClient() {
  return createLocalDbClient();
}
