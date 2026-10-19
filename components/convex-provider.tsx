"use client";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { VisitSyncProvider } from "@/lib/use-visit-sync";
import { convex } from "@/lib/convex-client";
export default function ConvexProvider({ children, initialToken }: { children: React.ReactNode; initialToken?: string | null }) {
  // The component types target Better Auth 1.6.15; later security patches change
  // useSession inference. Its provider uses the unchanged session/token methods.
  return <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as AuthClient} initialToken={initialToken}><VisitSyncProvider>{children}</VisitSyncProvider></ConvexBetterAuthProvider>;
}
