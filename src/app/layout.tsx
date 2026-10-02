import "./globals.css";
import type { Metadata, Viewport } from "next";
import RegisterSW from "./register-sw";

export const metadata: Metadata = {
  title: "CompPilot",
  description: "Guided comparable-sales market analysis",
  appleWebApp: { capable: true, title: "CompPilot", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1f" },
  ],
  width: "device-width",
  initialScale: 1,
};

const PIN = "M256 62c-94 0-166 70-166 158 0 116 166 236 166 236s166-120 166-236c0-88-72-158-166-158Z";

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden>
        <rect width="512" height="512" rx="115" fill="#4f46e5" />
        <path d={PIN} fill="#fff" />
        <path d="M256 130 360 224V326H152V224Z" fill="#4f46e5" stroke="#4f46e5" strokeWidth="12" strokeLinejoin="round" />
        <path d="M256 238 292 316 256 298 220 316Z" fill="#fff" />
      </svg>
      <span className="text-lg font-bold tracking-tight">CompPilot</span>
    </span>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <RegisterSW />
        <header className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 80%, transparent)" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/"><Logo /></a>
            <a href="/login" className="btn">Account</a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
