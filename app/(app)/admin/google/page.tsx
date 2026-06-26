import { redirect } from "next/navigation";
import {
  CloudCog,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
  FolderTree,
  ExternalLink,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { folderUrl, sheetUrl, googleConfigured } from "@/lib/google";
import { PageHeader } from "@/components/page-header";
import { GooglePanel } from "./_components/google-panel";

export const maxDuration = 60;

export default async function GoogleAdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER") redirect("/");
  const biz = await getCurrentBusiness();
  if (!biz) {
    return (
      <div className="p-8">
        <PageHeader icon={CloudCog} title="เชื่อม Google Drive" />
        <p className="mt-4 text-red-600">ยังไม่มีสิทธิ์เข้าถึงธุรกิจ</p>
      </div>
    );
  }

  const [b, months, recent] = await Promise.all([
    prisma.business.findUnique({
      where: { id: biz.id },
      select: {
        googleEmail: true,
        googleRefreshToken: true,
        driveRootFolderId: true,
        masterSheetId: true,
        googleSyncedAt: true,
      },
    }),
    prisma.fiscalMonth.findMany({
      orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
      include: { year: true },
    }),
    prisma.driveFile.findMany({
      where: { businessId: biz.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const connected = !!b?.googleRefreshToken;
  const structureReady = !!b?.masterSheetId;
  const monthOpts = months.map((m) => ({
    id: m.id,
    label: `${m.label} ${m.year.yearBE}`,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <PageHeader
        icon={CloudCog}
        title="เชื่อม Google Drive"
        description={`${biz.name} — เก็บหลักฐาน/บิล + Master Sheet ใน Google Drive ของร้าน`}
      />

      {!googleConfigured() && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          ยังไม่ได้ตั้งค่า <code>AUTH_GOOGLE_ID</code> /{" "}
          <code>AUTH_GOOGLE_SECRET</code> — ใส่ใน Vercel ก่อน
        </div>
      )}

      {/* Status */}
      <section className="rounded-card border border-hairline bg-canvas p-5 space-y-3">
        <StatusRow
          ok={connected}
          label={
            connected
              ? `เชื่อมแล้ว: ${b?.googleEmail ?? "—"}`
              : "ยังไม่ได้เชื่อม Google"
          }
        />
        <StatusRow
          ok={structureReady}
          label={
            structureReady
              ? "สร้างโฟลเดอร์ + Master Sheet แล้ว"
              : "ยังไม่ได้สร้างโครงสร้าง"
          }
        />
        {b?.googleSyncedAt && (
          <p className="text-xs text-muted">
            ซิงค์ล่าสุด: {b.googleSyncedAt.toLocaleString("th-TH")}
          </p>
        )}

        {structureReady && (
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            <a
              href={sheetUrl(b!.masterSheetId)!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-ink underline"
            >
              <FileSpreadsheet className="h-4 w-4" /> เปิด Master Sheet{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={folderUrl(b!.driveRootFolderId)!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-ink underline"
            >
              <FolderTree className="h-4 w-4" /> เปิดโฟลเดอร์ใน Drive{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <div className="pt-2">
          <GooglePanel
            connected={connected}
            structureReady={structureReady}
            months={monthOpts}
          />
        </div>
      </section>

      {/* Recent uploads */}
      {recent.length > 0 && (
        <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
          <header className="border-b border-hairline-soft px-5 py-3">
            <h2 className="text-sm font-semibold">ไฟล์หลักฐานล่าสุดใน Drive</h2>
          </header>
          <ul className="divide-y divide-hairline-soft text-xs">
            {recent.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-2">
                <span
                  className={
                    "rounded-pill px-2 py-0.5 " +
                    (f.kind === "SLIP"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-amber-100 text-amber-800")
                  }
                >
                  {f.kind === "SLIP" ? "สลิป" : "บิลซื้อ"}
                </span>
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-ink underline truncate"
                >
                  {f.name}
                </a>
                <span className="text-muted whitespace-nowrap">
                  {f.createdAt.toLocaleDateString("th-TH")} ·{" "}
                  {f.uploadedByName ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Setup guide */}
      <section className="rounded-card border border-hairline bg-surface/40 p-5 text-sm">
        <h2 className="font-semibold mb-2">
          วิธีตั้งค่า Google Cloud (ทำครั้งเดียว)
        </h2>
        <ol className="list-decimal pl-5 space-y-1 text-muted">
          <li>
            เปิด <strong>Google Drive API</strong> และ{" "}
            <strong>Google Sheets API</strong> ในโปรเจกต์ Google Cloud เดิม
            (ที่ใช้ทำ login)
          </li>
          <li>
            ใน OAuth consent screen เพิ่ม scope: <code>drive.file</code> และ{" "}
            <code>spreadsheets</code>
          </li>
          <li>
            ใน OAuth Client เพิ่ม <strong>Authorized redirect URI</strong>:
            <br />
            <code>
              https://dashboard-roan-eta-72.vercel.app/api/google/callback
            </code>{" "}
            และ <code>http://localhost:3000/api/google/callback</code>
          </li>
          <li>
            กลับมากดปุ่ม <strong>“เชื่อม Google Drive ของร้าน”</strong> ด้านบน →
            อนุญาต → กด <strong>“สร้างโครงสร้าง”</strong> แล้ว{" "}
            <strong>“ซิงค์”</strong>
          </li>
        </ol>
      </section>
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={2} />
      ) : (
        <Circle className="h-5 w-5 text-muted-soft" strokeWidth={2} />
      )}
      <span>{label}</span>
    </div>
  );
}
