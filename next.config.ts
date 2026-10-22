import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

// This public identifier is embedded into both the client and the version endpoint.
// No credentials belong in `env`: Next.js includes these values in browser bundles.
const version = process.env.VERCEL_DEPLOYMENT_ID ?? (process.env.NODE_ENV === "production" ? randomUUID() : "development");
// The shortcut API runs as Convex HTTP actions; this keeps its public address on the app's own domain.
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.convex\.cloud$/, ".convex.site");
const config: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  async rewrites() {
    return convexSiteUrl ? [{ source: "/api/v1/:path*", destination: `${convexSiteUrl}/api/v1/:path*` }] : [];
  },
  async headers() {
    return [{ source: "/manifest.json", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] }];
  },
};
export default config;
