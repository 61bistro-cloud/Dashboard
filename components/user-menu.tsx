import { signOut } from "@/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export function UserMenu({
  email,
  name,
  role,
}: {
  email: string;
  name?: string | null;
  role: Role;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-hairline">
      <div className="flex h-9 w-9 items-center justify-center rounded-pill bg-ink text-canvas text-sm font-medium">
        {(name ?? email).slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{name ?? email}</div>
        <div className="truncate text-xs text-muted">{ROLE_LABELS[role]}</div>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/sign-in" });
        }}
      >
        <button
          type="submit"
          className="text-xs text-muted hover:text-ink transition-colors"
          aria-label="ออกจากระบบ"
          title="ออกจากระบบ"
        >
          ออก
        </button>
      </form>
    </div>
  );
}
