import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { isSystemAdmin, systemAdminEmails } from "@/lib/system-admin-policy";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      isSystemAdmin: boolean;
    };
  }
  interface User {
    role: Role;
  }
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
     *   1. already in our User table (provisioned by a system administrator), or
     *   2. in the SYSTEM_ADMIN_EMAILS allowlist (auto-provisions as OWNER).
     */
    signIn: async ({ user, account, profile }) => {
      // Provisioning is invitation-only. Trust only Google's verified identity.
      const email = user.email?.trim().toLowerCase();
      if (
        !email ||
        account?.provider !== "google" ||
        profile?.email_verified !== true ||
        profile.email?.toLowerCase() !== email
      )
        return false;
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true },
      });
      if (existing)
        return (
          isSystemAdmin(existing) ||
          (await prisma.userBusiness.count({
            where: { userId: existing.id, business: { active: true } },
          })) > 0
        );
      if (!systemAdminEmails().includes(email)) return false;
      // Concurrent OAuth callbacks must not create duplicate users or downgrade
      // an already provisioned account.
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name: user.name ?? null, role: "OWNER" },
      });
      return true;
    },
    jwt: async ({ token, user }) => {
      const select = { id: true, email: true, name: true, role: true } as const;
      const dbUser = user?.email
        ? await prisma.user.findUnique({
            where: { email: user.email.trim().toLowerCase() },
            select,
          })
        : typeof token.id === "string"
          ? await prisma.user.findUnique({ where: { id: token.id }, select })
          : null;
      // Recheck on every request: deleted users and changed roles cannot keep
      // old access through a long-lived JWT. Database errors fail authentication.
      if (!dbUser) return null;
      const systemAdmin = isSystemAdmin(dbUser);
      if (
        !systemAdmin &&
        !(await prisma.userBusiness.count({
          where: { userId: dbUser.id, business: { active: true } },
        }))
      )
        return null;
      token.id = dbUser.id;
      token.email = dbUser.email;
      token.name = dbUser.name;
      token.role = dbUser.role;
      token.isSystemAdmin = systemAdmin;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.email = token.email!;
        session.user.name = token.name;
        session.user.isSystemAdmin = token.isSystemAdmin === true;
      }
      return session;
    },
  },
});
