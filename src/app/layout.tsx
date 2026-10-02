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
    { media: "(prefers-color-scheme: light)", color: "#16204a" },
    { media: "(prefers-color-scheme: dark)", color: "#070b1c" },
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
          <linearGradient id="lm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16204a" /><stop offset="1" stopColor="#070b1c" /></linearGradient>
          <linearGradient id="lm-metal" x1=".1" y1="0" x2=".9" y2="1">
            <stop offset="0" stopColor="#fff1c7" /><stop offset=".28" stopColor="#f0cf7e" /><stop offset=".55" stopColor="#c9973f" /><stop offset=".8" stopColor="#e9c46a" /><stop offset="1" stopColor="#9c6f24" />
          </linearGradient>
          <linearGradient id="lm-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset=".42" stopColor="#fff" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="512" height="512" rx="115" fill="url(#lm-bg)" />
        <path d={PIN} fill="url(#lm-metal)" />
        <path d={PIN} fill="url(#lm-shine)" />
        <path d="M256 112 372 214H350V330H162V214H140Z" fill="#070b1c" stroke="#070b1c" strokeWidth="10" strokeLinejoin="round" />
        <g fill="none" stroke="#fff1c7" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
          <path d="M202 214 256 160 310 214" />
          <path d="M222 242 256 208 290 242" opacity=".5" />
        </g>
        <path d="M256 252 296 322 256 304 216 322Z" fill="url(#lm-metal)" />
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
