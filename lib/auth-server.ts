import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
// Preview deployments only know their .cloud URL at build time; the .site URL follows from it.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? convexUrl?.replace(/\.convex\.cloud$/, ".convex.site");
export const { handler, getToken, isAuthenticated, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } = convexBetterAuthNextJs({
  convexUrl, convexSiteUrl,
});
