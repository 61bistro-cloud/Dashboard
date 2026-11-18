import { isSystemAdmin } from "@/lib/system-admin-policy";
import { CustomerOnboarding } from "./_components/customer-onboarding";
import { dateLocale } from "@/lib/i18n/core";

import { getUi } from "@/lib/i18n/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AddUserForm } from "./_components/add-user-form";
import { RoleSelect, DeleteUserButton } from "./_components/user-row-actions";
import { UserBusinessAssign } from "./_components/user-businesses";

export default async function UsersAdminPage() {
  const { ui, uiLocale } = await getUi();
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!session.user.isSystemAdmin) redirect("/");

  const [users, businesses] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        businesses: { select: { businessId: true } },
      },
    }),
    prisma.business.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={Users}
        title={ui("จัดการผู้ใช้")}
        description={ui(
          "รายชื่อผู้ใช้ทั้งหมด {v0} คน — ใช้ Google sign-in เท่านั้น",
          { v0: users.length }
        )}
      />

      <CustomerOnboarding />
      <details className="rounded-card border border-hairline p-4">
        <summary className="text-sm font-semibold cursor-pointer">
          {ui("เพิ่มผู้ใช้ในธุรกิจเดิม")}
        </summary>
        <div className="mt-4">
          <AddUserForm businesses={businesses} />
        </div>
      </details>

      <div className="overflow-hidden rounded-card border border-hairline bg-canvas">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-4 py-3 font-medium">{ui("ชื่อ")}</th>
              <th className="px-4 py-3 font-medium">{ui("อีเมล")}</th>
              <th className="px-4 py-3 font-medium">{ui("สิทธิ์")}</th>
              <th className="px-4 py-3 font-medium">
                {ui("ธุรกิจที่เข้าถึงได้")}
              </th>
              <th className="px-4 py-3 font-medium">{ui("สร้างเมื่อ")}</th>
              <th className="px-4 py-3 font-medium text-right">
                {ui("จัดการ")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {users.map((u) => {
              const isMe = u.id === session.user.id;
              return (
                <tr key={u.id} className={isMe ? "bg-surface/50" : ""}>
                  <td className="px-4 py-3">
                    {u.name ?? <span className="text-muted-soft">—</span>}
                    {isMe && (
                      <span className="ml-2 rounded-pill bg-ink text-canvas px-1.5 py-0.5 text-[10px] font-medium">
                        {ui("คุณ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/75">{u.email}</td>
                  <td className="px-4 py-3">
                    <RoleSelect
                      id={u.id}
                      currentRole={u.role}
                      isMe={isMe}
                      systemAdmin={isSystemAdmin(u)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <UserBusinessAssign
                      userId={u.id}
                      allBusinesses={businesses}
                      assigned={u.businesses.map((b) => b.businessId)}
                      isOwner={isSystemAdmin(u)}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {u.createdAt.toLocaleDateString(dateLocale(uiLocale))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteUserButton
                      id={u.id}
                      email={u.email}
                      isMe={isMe}
                      systemAdmin={isSystemAdmin(u)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-input border border-dashed border-hairline bg-surface p-4 text-xs text-ink/75 space-y-1.5">
        <p className="font-medium text-ink">{ui("📌 หมายเหตุ")}</p>
        <ul className="list-disc list-inside space-y-0.5 text-muted">
          <li>
            {ui(
              "เพิ่มอีเมลแล้ว ผู้ใช้นั้นสามารถกดปุ่ม “เข้าสู่ระบบด้วย Google” ได้ทันที"
            )}
          </li>
          <li>
            {ui(
              "เปลี่ยนสิทธิ์ใช้ dropdown ที่คอลัมน์ “สิทธิ์” — เปลี่ยนทันทีเมื่อเลือก"
            )}
          </li>
          <li>
            {ui(
              "การถอนสิทธิ์จะหยุดการเข้าถึง โดยเก็บผู้ใช้และประวัติรายการเดิมไว้"
            )}
          </li>
          <li>
            <strong>{ui("สิทธิ์")}</strong>
            {ui(
              ": เจ้าของร้านดูแลเฉพาะธุรกิจที่ได้รับสิทธิ์ ผู้ดูแลระบบเท่านั้นที่จัดการลูกค้าและธุรกิจทั้งหมดได้"
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}
