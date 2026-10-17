import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

// This public identifier is embedded into both the client and the version endpoint.
// No credentials belong in `env`: Next.js includes these values in browser bundles.
const version = process.env.VERCEL_DEPLOYMENT_ID ?? (process.env.NODE_ENV === "production" ? randomUUID() : "development");
const config: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  async headers() {
    return [{ source: "/manifest.json", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] }];
  },
};
export default config;
