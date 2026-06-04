import type { Role } from "@prisma/client";
import { NAV_ICONS, type LucideIcon } from "@/lib/icons";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "เจ้าของร้าน",
  ACCOUNTANT: "บัญชี",
  STAFF: "พนักงาน",
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: NAV_ICONS["/"],
    roles: ["OWNER", "ACCOUNTANT", "STAFF"],
  },
  {
    href: "/daily-pl",
    label: "Daily P&L",
    icon: NAV_ICONS["/daily-pl"],
    roles: ["OWNER", "ACCOUNTANT", "STAFF"],
  },
  {
    href: "/monthly-pl",
    label: "Monthly P&L",
    icon: NAV_ICONS["/monthly-pl"],
    roles: ["OWNER", "ACCOUNTANT"],
  },
  {
    href: "/cost-setup",
    label: "Cost Setup",
    icon: NAV_ICONS["/cost-setup"],
    roles: ["OWNER", "ACCOUNTANT"],
  },
  {
    href: "/pos-sales",
    label: "POS Sales",
    icon: NAV_ICONS["/pos-sales"],
    roles: ["OWNER", "ACCOUNTANT", "STAFF"],
  },
  {
    href: "/bank",
    label: "Bank & Reconcile",
    icon: NAV_ICONS["/bank"],
    roles: ["OWNER", "ACCOUNTANT"],
  },
  {
    href: "/admin/businesses",
    label: "จัดการธุรกิจ",
    icon: NAV_ICONS["/admin/businesses"],
    roles: ["OWNER"],
  },
  {
    href: "/admin/users",
    label: "จัดการผู้ใช้",
    icon: NAV_ICONS["/admin/users"],
    roles: ["OWNER"],
  },
];

export function canAccess(pathname: string, role: Role): boolean {
  if (pathname === "/sign-in") return true;
  const item = NAV_ITEMS.find(
    (i) => i.href === pathname || pathname.startsWith(i.href + "/")
  );
  if (!item) return true;
  return item.roles.includes(role);
}
