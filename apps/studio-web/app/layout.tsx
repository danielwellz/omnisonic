import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-bold">
                Omnisonic Studio
              </Link>
              <nav className="inline-flex gap-4 text-sm text-gray-600">
                <Link href="/about">About</Link>
                <Link href="/sessions">Sessions</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              {session?.user ? (
                <>
                  <span className="hidden sm:inline">{session.user.email ?? session.user.name}</span>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/signin" });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link
                  href="/signin"
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        {children}
        <footer className="border-t px-6 py-8 text-sm text-gray-500">© Omnisonic</footer>
      </body>
    </html>
  );
}
