import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppUpdater from "@/components/app-updater";

export const metadata: Metadata = {
  title: "ChaxterLog · Einfach zählen.",
  description: "Die Besucherzählung für das Schülercafé Grafing. Ein Tippen, ein Besuch.",
  applicationName: "ChaxterLog",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ChaxterLog", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#101a20" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}<AppUpdater /></body></html>;
}
