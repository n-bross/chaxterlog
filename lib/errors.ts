import { ConvexError } from "convex/values";
// Production Convex replaces plain server error messages with "Server Error"; user-facing ones are ConvexError strings.
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) return typeof error.data === "string" ? error.data : fallback;
  if (error instanceof Error && !/\[CONVEX|\[Request ID|Server Error/.test(error.message)) return error.message;
  return fallback;
}
