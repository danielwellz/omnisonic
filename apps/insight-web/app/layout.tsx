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
            <h1 className="text-lg font-semibold tracking-wide">Omnisonic Insight</h1>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
