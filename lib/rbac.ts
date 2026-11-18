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
  systemAdminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: NAV_ICONS["/"],
    roles: ["OWNER", "ACCOUNTANT", "STAFF"],
  },
  {
    href: "/business-advice",
    label: "แนะนำธุรกิจ",
    icon: NAV_ICONS["/business-advice"],
    roles: ["OWNER", "ACCOUNTANT"],
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
    href: "/closing",
    label: "ปิดงบรายเดือน",
    icon: NAV_ICONS["/closing"],
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
    href: "/bank/grab",
    label: "สรุป Grab",
    icon: NAV_ICONS["/bank/grab"],
    roles: ["OWNER", "ACCOUNTANT"],
  },
  {
    href: "/daily-recon",
    label: "กระทบยอดรายวัน",
    icon: NAV_ICONS["/daily-recon"],
    roles: ["OWNER", "ACCOUNTANT"],
  },
  {
    href: "/admin/businesses",
    systemAdminOnly: true,
    label: "จัดการธุรกิจ",
    icon: NAV_ICONS["/admin/businesses"],
    roles: ["OWNER"],
  },
  {
    href: "/admin/users",
    systemAdminOnly: true,
    label: "จัดการผู้ใช้",
    icon: NAV_ICONS["/admin/users"],
    roles: ["OWNER"],
  },
  {
    href: "/admin/google",
    label: "เชื่อมต่อ Google / LINE",
    icon: NAV_ICONS["/admin/google"],
    roles: ["OWNER"],
  },
];

export function canAccess(
  pathname: string,
  role: Role,
  systemAdmin = false
): boolean {
  if (pathname === "/sign-in") return true;
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => i.href === pathname || pathname.startsWith(i.href + "/"));
  if (!item) return true;
  return item.roles.includes(role) && (!item.systemAdminOnly || systemAdmin);
}
