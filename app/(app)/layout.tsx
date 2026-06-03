import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";
import { UtensilsCrossed } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-hairline bg-canvas">
        <div className="px-5 py-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-card bg-ink text-canvas">
            <UtensilsCrossed className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight tracking-tight">
              61 Bistro
            </div>
            <div className="text-xs text-muted">ระบบบัญชี 2569</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={session.user.role} />
        </div>
        <UserMenu
          email={session.user.email}
          name={session.user.name}
          role={session.user.role}
        />
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
