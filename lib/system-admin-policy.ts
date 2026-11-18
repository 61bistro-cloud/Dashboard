import type { Role } from "@prisma/client";

// Explicit, frozen compatibility list of the three existing system operators
// audited before customer onboarding (2026-11-19). These are identifiers, not
// credentials. New OWNER users are NEVER added automatically. Override with
// SYSTEM_ADMIN_USER_IDS to manage the list through deployment configuration.
const EXISTING_SYSTEM_ADMIN_IDS = [
  "cmpy7rtcv0000vfxkln0xtx4h",
  "cmpzeasxp0000js04hlrbdae7",
  "cmvxow9620000la04qagmx4mr",
];
const list = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export function systemAdminEmails(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return list(env.SYSTEM_ADMIN_EMAILS).map((v) => v.toLowerCase());
}
export function isSystemAdmin(
  user: { id: string; email: string; role: Role },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (user.role !== "OWNER") return false;
  const ids =
    env.SYSTEM_ADMIN_USER_IDS === undefined
      ? EXISTING_SYSTEM_ADMIN_IDS
      : list(env.SYSTEM_ADMIN_USER_IDS);
  return (
    ids.includes(user.id) ||
    systemAdminEmails(env).includes(user.email.trim().toLowerCase())
  );
}
