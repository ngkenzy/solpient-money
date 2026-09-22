import { readMockFdxToken } from "@/lib/connect/fdx/mock-token";

export function requireMockFdxAccess(request: Request) {
  const authorization =
    request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing sandbox bearer token.");
  }
  return readMockFdxToken(match[1], "access");
}
