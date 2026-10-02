import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CompPilot",
  description: "Guided comparable-sales market analysis",
};

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M7 17 16 8l9 9v8a1 1 0 0 1-1 1h-5v-6h-6v6H8a1 1 0 0 1-1-1z" fill="var(--brand-ink)" opacity=".95" />
      </svg>
      <span className="text-lg font-bold tracking-tight">CompPilot</span>
    </span>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
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
