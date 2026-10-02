import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CompPilot",
  description: "Guided comparable-sales market analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="no-print border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-semibold">CompPilot</a>
            <a href="/login" className="text-sm text-slate-600 hover:underline">Account</a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
