import "./globals.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <header className="px-6 py-4 border-b">
          <a href="/" className="font-bold">Omnisonic Studio</a>
          <nav className="inline-flex gap-4 ml-6">
            <a href="/about">About</a>
            <a href="/sessions">Sessions</a>
          </nav>
        </header>
        {children}
        <footer className="px-6 py-8 border-t text-sm text-gray-500">© Omnisonic</footer>
      </body>
    </html>
  );
}
