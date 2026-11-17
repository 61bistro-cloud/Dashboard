import { useUi } from "@/lib/i18n/use-ui";
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { ThemeToggle } from "./theme-toggle";

export function UserMenu({
  email,
  name,
  role,
}: {
  email: string;
  name?: string | null;
  role: Role;
}) {
  const { ui } = useUi();
  const displayName = name?.trim() || email;
  return (
    <div className="shrink-0 px-3 pb-3 pt-2">
      <div className="rounded-2xl border border-hairline bg-surface/60 p-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-canvas text-sm font-semibold text-ink"
          >
            {Array.from(displayName)[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="line-clamp-2 break-words text-sm font-semibold leading-5 text-ink"
              title={displayName}
            >
              {displayName}
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted">
              {ui(ROLE_LABELS[role])}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline-soft pt-3">
          <ThemeToggle />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2 text-xs font-medium text-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label={ui("ออกจากระบบ")}
              title={ui("ออกจากระบบ")}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="whitespace-nowrap">{ui("ออกจากระบบ")}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
