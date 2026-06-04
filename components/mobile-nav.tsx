"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, UtensilsCrossed } from "lucide-react";

/**
 * Mobile-only chrome: a sticky top bar with a hamburger that opens a
 * slide-out navigation drawer. The drawer body (business switcher + nav +
 * user menu) is passed as children so it stays identical to the desktop
 * sidebar. Hidden at md+ where the static sidebar takes over.
 */
export function MobileNav({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (i.e. a nav link was tapped)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden sticky top-0 z-30 border-b border-hairline bg-canvas pt-safe">
        <div className="flex items-center gap-3 h-14 px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="เปิดเมนู"
            className="flex h-10 w-10 items-center justify-center rounded-pill hover:bg-surface active:bg-surface"
          >
            <Menu className="h-6 w-6" strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-card bg-ink text-canvas shrink-0">
              <UtensilsCrossed className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <span className="truncate text-[15px] font-semibold tracking-tight">
              {title}
            </span>
          </div>
        </div>
      </header>

      {/* Overlay + drawer */}
      <div
        className={
          "md:hidden fixed inset-0 z-50 " + (open ? "" : "pointer-events-none")
        }
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={
            "absolute inset-0 bg-black/40 transition-opacity duration-200 " +
            (open ? "opacity-100" : "opacity-0")
          }
        />
        <aside
          className={
            "absolute left-0 top-0 h-full w-[84%] max-w-[330px] flex flex-col " +
            "bg-canvas border-r border-hairline shadow-2xl pt-safe pb-safe pl-safe " +
            "transition-transform duration-200 ease-out " +
            (open ? "translate-x-0" : "-translate-x-full")
          }
        >
          <div className="flex justify-end px-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิดเมนู"
              className="flex h-10 w-10 items-center justify-center rounded-pill hover:bg-surface"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
          {children}
        </aside>
      </div>
    </>
  );
}
