import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BusinessManager } from "./_components/business-manager";

export default async function BusinessesAdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER") redirect("/");

  const businesses = await prisma.business.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      _count: {
        select: { employees: true, posBills: true, bankTransactions: true },
      },
    },
  });

  const rows = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    active: b.active,
    counts: {
      employees: b._count.employees,
      bills: b._count.posBills,
      bankTx: b._count.bankTransactions,
    },
  }));

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <PageHeader
        icon={Building2}
        title="จัดการธุรกิจ"
        description={`ทั้งหมด ${rows.length} ธุรกิจ — แต่ละธุรกิจแยกข้อมูลกันโดยสมบูรณ์`}
      />
      <BusinessManager businesses={rows} />
    </div>
  );
}
