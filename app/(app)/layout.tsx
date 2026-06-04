import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";
import { BusinessSwitcher } from "@/components/business-switcher";
import { getAccessibleBusinesses, getCurrentBusiness } from "@/lib/business";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const [businesses, current] = await Promise.all([
    getAccessibleBusinesses(),
    getCurrentBusiness(),
  ]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-hairline bg-canvas">
        <div className="px-4 py-5">
          <BusinessSwitcher
            businesses={businesses}
            currentId={current?.id ?? 0}
          />
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
