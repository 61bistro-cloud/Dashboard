import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";
import { BusinessSwitcher } from "@/components/business-switcher";
import { MobileNav } from "@/components/mobile-nav";
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

  // Shared between the desktop sidebar and the mobile drawer
  const navBody = (
    <>
      <div className="px-4 py-4 md:py-5">
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
    </>
  );

  return (
    <div className="min-h-screen md:flex bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-hairline bg-canvas h-screen sticky top-0">
        {navBody}
      </aside>

      {/* Mobile content column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav title={current?.name ?? "61 Bistro"}>{navBody}</MobileNav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
