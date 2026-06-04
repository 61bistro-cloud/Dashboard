import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
    };
  }
  interface User {
    role: Role;
  }
}

/** Comma-separated list of emails that auto-provision as OWNER on first login. */
function ownerAllowlist(): string[] {
  return (process.env.AUTH_GOOGLE_OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  // Vercel sets VERCEL_URL on each deploy — trust it so OAuth callback URLs
  // resolve correctly behind their proxy.
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Always show the account chooser, never silent-login a wrong account.
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  callbacks: {
    /**
     * Gatekeeper. Reject any Google account whose email isn't either:
     *   1. already in our User table (added by another OWNER), or
     *   2. in the AUTH_GOOGLE_OWNER_EMAILS allowlist (auto-provisions as OWNER).
     */
    signIn: async ({ user }) => {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return true;

      if (ownerAllowlist().includes(email)) {
        await prisma.user.create({
          data: {
            email,
            name: user.name ?? null,
            role: "OWNER",
          },
        });
        return true;
      }
      return false;
    },
    jwt: async ({ token, user }) => {
      // First sign-in: hydrate token from DB (Google's user object has no role).
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
