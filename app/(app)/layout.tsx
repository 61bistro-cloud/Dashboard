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
      <div className="shrink-0 border-b border-hairline px-4 py-4 md:py-5">
        <BusinessSwitcher
          businesses={businesses}
          currentId={current?.id ?? 0}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
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
    <div className="min-h-dvh bg-canvas md:pl-64 print:pl-0">
      {/* Desktop sidebar */}
      <aside
        aria-label="แถบเมนูหลัก"
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-hairline bg-canvas md:flex print:hidden"
      >
        {navBody}
      </aside>

      {/* Mobile content column */}
      <div className="min-h-dvh min-w-0 flex flex-col">
        <MobileNav title={current?.name ?? "61 Bistro"}>{navBody}</MobileNav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
