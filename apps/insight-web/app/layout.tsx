import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omnisonic Insight",
  description: "Cross-genre news and analytics"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <header className="border-b border-gray-800 px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Link href="/" className="text-lg font-semibold tracking-wide text-white">
              Omnisonic Insight
            </Link>
            <nav className="flex items-center gap-4 text-sm text-gray-400">
              <Link href="/" className="hover:text-white">
                Overview
              </Link>
              <Link href="/analytics" className="hover:text-white">
                Analytics
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
