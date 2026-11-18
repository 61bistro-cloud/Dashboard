import Link from "next/link";
import { redirect } from "next/navigation";
import { Bike } from "lucide-react";
import { auth } from "@/auth";
import { getCurrentBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { getGrabMonth } from "@/lib/grab-data";
import { getCurrentFiscalMonth } from "@/lib/fiscal-server";
import { getUi } from "@/lib/i18n/server";
import { displayMonth } from "@/lib/i18n/core";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "../../cost-setup/_components/month-picker";
import { GrabUpload } from "./_components/grab-upload";
import { GrabDetails } from "./_components/grab-details";
export default async function GrabPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!["OWNER", "ACCOUNTANT"].includes(session.user.role)) redirect("/");
  const { ui, uiLocale } = await getUi(),
    business = await getCurrentBusiness();
  if (!business) return <p className="p-8">{ui("grab.business")}</p>;
  const sp = await searchParams;
  const [months, connection, latest] = await Promise.all([
    prisma.fiscalMonth.findMany({
      include: { year: true },
      orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    }),
    prisma.business.findUnique({
      where: { id: business.id },
      select: { googleRefreshToken: true },
    }),
    prisma.driveFile.findFirst({
      where: { businessId: business.id, kind: "GRAB_REPORT" },
      orderBy: { createdAt: "desc" },
      select: { fiscalMonthId: true },
    }),
  ]);
  const month =
    months.find((m) => m.id === Number(sp.month)) ??
    months.find((m) => m.id === latest?.fiscalMonthId) ??
    (await getCurrentFiscalMonth()) ??
    months[0];
  if (!month) return <p className="p-8">{ui("ยังไม่มีเดือนในระบบ")}</p>;
  let data: Awaited<ReturnType<typeof getGrabMonth>> | null = null;
  try {
    data = await getGrabMonth(business.id, month);
  } catch {
    /* Show corrupt/unavailable reports explicitly, never as zero. */
  }
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <PageHeader
        icon={Bike}
        title={ui("สรุป Grab")}
        description={`${business.name} — ${displayMonth(month.fullLabel, uiLocale)}`}
        action={
          <MonthPicker
            months={months.map((m) => ({
              id: m.id,
              label: displayMonth(`${m.label} ${m.year.yearBE}`, uiLocale),
            }))}
            currentId={month.id}
          />
        }
      />
      <div className="flex flex-wrap gap-4 text-xs">
        <Link className="underline" href={`/bank?month=${month.id}`}>
          {ui("กลับ Bank & Reconcile")}
        </Link>
        <Link className="underline" href="/">
          {ui("Dashboard")}
        </Link>
      </div>
      <div className="rounded-card border border-hairline bg-surface p-4 text-xs leading-6">
        {ui("grab.intro")}
      </div>
      <GrabUpload
        key={`${business.id}-${month.id}`}
        businessId={business.id}
        monthId={month.id}
        connected={!!connection?.googleRefreshToken}
      />
      {!data ? (
        <p role="alert" className="text-sm text-amber-600">
          {ui("grab.stored")}
        </p>
      ) : (
        <>
          {!data.rows.length && (
            <p className="rounded-card border border-dashed border-hairline p-5 text-sm">
              {ui("grab.empty")}
            </p>
          )}
          <GrabDetails
            key={`${business.id}-${month.id}`}
            data={data}
            monthId={month.id}
          />
        </>
      )}
    </div>
  );
}
