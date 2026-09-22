export function createClient() {
  throw new Error(
    "Solpient Local does not expose PostgreSQL directly to browser components. Use server actions or route handlers."
  );
}
