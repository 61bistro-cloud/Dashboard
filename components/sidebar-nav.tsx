"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { NAV_ITEMS } from "@/lib/rbac";

const REPORT_PATHS = new Set(["/", "/daily-pl", "/monthly-pl", "/closing"]);

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const sections = [
    {
      label: "ภาพรวมและรายงาน",
      items: items.filter((item) => REPORT_PATHS.has(item.href)),
    },
    {
      label: "บันทึกและกระทบยอด",
      items: items.filter(
        (item) =>
          !REPORT_PATHS.has(item.href) && !item.href.startsWith("/admin/")
      ),
    },
    {
      label: "จัดการระบบ",
      items: items.filter((item) => item.href.startsWith("/admin/")),
    },
  ];

  return (
    <nav aria-label="เมนูหลัก" className="pb-3">
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section
            key={section.label}
            aria-label={section.label}
            className="pb-2"
          >
            <h2 className="border-y border-hairline-soft bg-surface px-5 py-2 text-[11px] font-medium leading-5 text-muted">
              {section.label}
            </h2>
            <div className="space-y-0.5 pt-1.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "group mx-2 flex min-h-11 items-center gap-3 rounded-r-lg border-l-2 px-3 py-2.5 text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 " +
                      (active
                        ? "border-accent bg-accent/5 font-medium text-accent"
                        : "border-transparent text-ink/80 hover:bg-surface hover:text-ink")
                    }
                  >
                    <Icon
                      className={
                        "h-[18px] w-[18px] shrink-0 " +
                        (active
                          ? "text-accent"
                          : "text-muted group-hover:text-ink")
                      }
                      strokeWidth={1.6}
                    />
                    <span className="min-w-0 break-words">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
    </nav>
  );
}
