import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, enabledProviders, signIn } from "@/lib/auth";

interface SignInPageProps {
  searchParams?: { callbackUrl?: string };
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const callbackUrl = searchParams?.callbackUrl ?? "/sessions";

  if (session?.user) {
    redirect(callbackUrl);
  }

  const oauthProviders = enabledProviders.filter((provider) => provider.type === "oauth");
  const hasCredentials = enabledProviders.some((provider) => provider.type === "credentials");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Sign in to Omnisonic Studio</h1>
        <p className="text-sm text-gray-500">
          Continue where you left off or create new sessions with your collaborators.
        </p>
      </div>

      <div className="space-y-4">
        {oauthProviders.length > 0 ? (
          oauthProviders.map((provider) => (
            <form
              key={provider.id}
              action={async () => {
                "use server";
                await signIn(provider.id, { redirectTo: callbackUrl });
              }}
            >
              <button
                type="submit"
                className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-center text-sm font-medium text-gray-100 transition hover:border-gray-700 hover:bg-gray-850"
              >
                Sign in with {provider.name}
              </button>
            </form>
          ))
        ) : (
          <p className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
            OAuth providers are not configured. Use email/password below (development only).
          </p>
        )}
      </div>

      {hasCredentials ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <form
            className="space-y-4"
            action={async (formData) => {
              "use server";
              const email = formData.get("email")?.toString() ?? "";
              const password = formData.get("password")?.toString() ?? "";
              await signIn("credentials", { email, password, redirectTo: callbackUrl });
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none ring-offset-gray-950 focus:border-gray-200 focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none ring-offset-gray-950 focus:border-gray-200 focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-gray-100 px-4 py-2 text-center text-sm font-semibold text-gray-950 transition hover:bg-white"
            >
              Continue with email
            </button>
            <p className="text-xs text-gray-500">
              In development, accounts are created automatically when using email/password.
            </p>
          </form>
        </div>
      ) : null}

      <p className="text-center text-xs text-gray-500">
        Having trouble? <Link href="/" className="underline">Return home</Link>
      </p>
    </div>
  );
}
