import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@db/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

type ProviderInfo = { id: string; name: string; type: "oauth" | "credentials" };

const providers: any[] = [];
const configuredProviders: ProviderInfo[] = [];

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  const provider = GitHub({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET
  });
  providers.push(provider);
  configuredProviders.push({ id: provider.id, name: "GitHub", type: "oauth" });
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const provider = Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  });
  providers.push(provider);
  configuredProviders.push({ id: provider.id, name: "Google", type: "oauth" });
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  const provider = Discord({
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET
  });
  providers.push(provider);
  configuredProviders.push({ id: provider.id, name: "Discord", type: "oauth" });
}

const credentialsProvider = Credentials({
  name: "Credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" }
  },
  authorize: async (credentials) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
    const parsed = schema.safeParse(credentials);
    if (!parsed.success) {
      return null;
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      if (process.env.NODE_ENV === "production") {
        return null;
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = await prisma.user.create({
        data: {
          email,
          name: email.split("@")[0],
          password: hashedPassword
        }
      });
      return newUser;
    }

    if (!user.password) {
      return null;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return null;
    }

    return user;
  }
});

if (process.env.AUTH_ENABLE_CREDENTIALS !== "false") {
  providers.push(credentialsProvider);
  configuredProviders.push({ id: credentialsProvider.id, name: "Email/Password", type: "credentials" });
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database"
  },
  trustHost: true,
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    }
  },
  pages: {
    signIn: "/signin"
  }
});

export const enabledProviders = configuredProviders;
