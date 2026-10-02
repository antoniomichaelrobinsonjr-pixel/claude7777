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

const PIN = "M256 66c-92 0-162 68-162 154 0 112 162 232 162 232s162-120 162-232c0-86-70-154-162-154Z";

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden>
        <defs>
          <linearGradient id="lm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e1b4b" /><stop offset="1" stopColor="#0b1020" /></linearGradient>
          <linearGradient id="lm-pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset=".55" stopColor="#6ea8f5" /><stop offset="1" stopColor="#818cf8" /></linearGradient>
        </defs>
        <rect width="512" height="512" rx="115" fill="url(#lm-bg)" />
        <path d={PIN} fill="url(#lm-pin)" />
        <path d="M256 136 340 302 256 262 172 302Z" fill="#0b1020" />
        <g fill="none" stroke="#0b1020" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
          <path d="M200 338 256 308 312 338" opacity=".7" />
          <path d="M222 374 256 356 290 374" opacity=".4" />
        </g>
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
