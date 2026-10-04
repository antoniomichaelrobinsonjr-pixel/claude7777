import "./globals.css";
import type { Metadata, Viewport } from "next";
import RegisterSW from "./register-sw";
import Header from "./header";
import { I18nProvider } from "@/i18n";
import { EntitlementsProvider } from "@/billing/entitlements";
import { PrintGuard } from "@/billing/print-guard";

export const metadata: Metadata = {
  title: "CompPilot",
  description: "Guided comparable-sales market analysis",
  appleWebApp: { capable: true, title: "CompPilot", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16204a" },
    { media: "(prefers-color-scheme: dark)", color: "#070b1c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <RegisterSW />
        <I18nProvider>
          <EntitlementsProvider>
            <div className="app-shell">
              <Header />
              <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
            </div>
            <PrintGuard />
          </EntitlementsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
