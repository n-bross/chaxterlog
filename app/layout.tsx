import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConvexProvider from "@/components/convex-provider";
import { getToken } from "@/lib/auth-server";
import AppUpdater from "@/components/app-updater";
import StagingEnvironment from "@/components/staging-banner";

export const metadata: Metadata = {
  title: "ChaxterLog · Einfach zählen.",
  description: "Die Besucherzählung für das Schülercafé Grafing. Ein Tippen, ein Besuch.",
  applicationName: "ChaxterLog",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ChaxterLog", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#101a20" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const token = await getToken();
  return (
    <html lang="de" data-environment={process.env.NEXT_PUBLIC_IS_STAGING === "true" ? "staging" : "production"}>
      <body>
        <StagingEnvironment />
        <ConvexProvider initialToken={token}>{children}</ConvexProvider>
        <AppUpdater />
      </body>
    </html>
  );
}
