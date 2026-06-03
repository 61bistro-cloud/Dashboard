import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default async function UsersAdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        icon={Users}
        title="จัดการผู้ใช้"
        description={`รายชื่อผู้ใช้ทั้งหมด ${users.length} คน`}
      />

      <div className="overflow-hidden rounded-card border border-hairline bg-canvas">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อ</th>
              <th className="px-4 py-3 font-medium">อีเมล</th>
              <th className="px-4 py-3 font-medium">สิทธิ์</th>
              <th className="px-4 py-3 font-medium">สร้างเมื่อ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.name ?? "—"}</td>
                <td className="px-4 py-3 text-ink/75">{u.email}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {u.createdAt.toLocaleDateString("th-TH")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-input border border-dashed border-hairline bg-surface p-4 text-sm text-ink/75">
        ฟอร์มเพิ่ม / แก้ไข / ลบ ผู้ใช้ จะเพิ่มในเฟสถัดไป
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: "OWNER" | "ACCOUNTANT" | "STAFF" }) {
  const styles: Record<typeof role, string> = {
    OWNER: "bg-amber-100 text-amber-800",
    ACCOUNTANT: "bg-sky-100 text-sky-800",
    STAFF: "bg-surface text-ink/90",
  };
  return (
    <span
      className={`inline-flex rounded-pill px-2.5 py-0.5 text-xs font-medium ${styles[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
