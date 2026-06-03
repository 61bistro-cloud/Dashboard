"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { NAV_ITEMS } from "@/lib/rbac";

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "group flex items-center gap-3 rounded-pill px-3.5 py-2 text-[15px] transition-colors " +
              (active
                ? "bg-ink text-canvas font-medium"
                : "text-ink hover:bg-surface")
            }
          >
            <Icon
              className={
                "h-[18px] w-[18px] shrink-0 " +
                (active ? "" : "text-muted group-hover:text-ink")
              }
              strokeWidth={1.6}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
