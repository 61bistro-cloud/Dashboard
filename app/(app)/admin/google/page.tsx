import { displayMonth, dateLocale } from "@/lib/i18n/core";

import { getUi } from "@/lib/i18n/server";
import Link from "next/link";
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
import { LineConfig } from "./_components/line-config";

export const maxDuration = 60;

export default async function GoogleAdminPage() {
  const { ui, uiLocale } = await getUi();
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER") redirect("/");
  const biz = await getCurrentBusiness();
  if (!biz) {
    return (
      <div className="p-8">
        <PageHeader icon={CloudCog} title={ui("เชื่อม Google Drive")} />
        <p className="mt-4 text-red-600">{ui("ยังไม่มีสิทธิ์เข้าถึงธุรกิจ")}</p>
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
        lineChannelSecret: true,
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
  const lineConfigured = !!b?.lineChannelSecret;
  const webhookUrl =
    "https://dashboard-roan-eta-72.vercel.app/api/line/webhook";
  const monthOpts = months.map((m) => ({
    id: m.id,
    label: displayMonth(
      `${displayMonth(m.label, uiLocale)} ${m.year.yearBE}`,
      uiLocale
    ),
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <PageHeader
        icon={CloudCog}
        title={ui("เชื่อมต่อ Google / LINE")}
        description={ui(
          "{v0} — Master Sheet + หลักฐาน/บิล ใน Google Drive + รับสลิปผ่าน LINE",
          { v0: biz.name }
        )}
      />

      {!googleConfigured() && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {ui("ยังไม่ได้ตั้งค่า")} <code>AUTH_GOOGLE_ID</code> /{" "}
          <code>AUTH_GOOGLE_SECRET</code> {ui("— ใส่ใน Vercel ก่อน")}
        </div>
      )}

      {/* Status */}
      <section className="rounded-card border border-hairline bg-canvas p-5 space-y-3">
        <StatusRow
          ok={connected}
          label={
            connected
              ? ui("เชื่อมแล้ว: {v0}", { v0: b?.googleEmail ?? "—" })
              : ui("ยังไม่ได้เชื่อม Google")
          }
        />
        <StatusRow
          ok={structureReady}
          label={
            structureReady
              ? ui("สร้างโฟลเดอร์ + Master Sheet แล้ว")
              : ui("ยังไม่ได้สร้างโครงสร้าง")
          }
        />
        {b?.googleSyncedAt && (
          <p className="text-xs text-muted">
            {ui("ซิงค์ล่าสุด:")}{" "}
            {b.googleSyncedAt.toLocaleString(dateLocale(uiLocale))}
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
              <FileSpreadsheet className="h-4 w-4" /> {ui("เปิด Master Sheet")}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={folderUrl(b!.driveRootFolderId)!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-ink underline"
            >
              <FolderTree className="h-4 w-4" /> {ui("เปิดโฟลเดอร์ใน Drive")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <div className="pt-2">
          <GooglePanel
            businessId={biz.id}
            connected={connected}
            structureReady={structureReady}
            months={monthOpts}
          />
        </div>
      </section>

      <div className="rounded-card border border-hairline p-4 text-sm">
        <Link href="/bank/evidence" className="underline font-medium">
          {ui("ขั้นต่อไป: จับคู่หลักฐานกับ Statement →")}
        </Link>
        <p className="text-xs text-muted mt-1">
          {ui(
            "เลือกเดือนที่อัปโหลดไว้ อ่านข้อมูลจากรูป แล้วตรวจและยืนยันคู่ใน Bank & Reconcile"
          )}
        </p>
      </div>
      <LineConfig configured={lineConfigured} webhookUrl={webhookUrl} />

      {/* Recent uploads */}
      {recent.length > 0 && (
        <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
          <header className="border-b border-hairline-soft px-5 py-3">
            <h2 className="text-sm font-semibold">
              {ui("ไฟล์หลักฐานล่าสุดใน Drive")}
            </h2>
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
                  {f.kind === "SLIP" ? ui("สลิป") : ui("บิลซื้อ")}
                </span>
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-ink underline truncate"
                >
                  {f.name}
                </a>
                {f.fiscalMonthId && (
                  <Link
                    className="underline whitespace-nowrap"
                    href={`/bank/evidence?month=${f.fiscalMonthId}`}
                  >
                    {ui("จับคู่")}
                  </Link>
                )}
                <span className="text-muted whitespace-nowrap">
                  {f.createdAt.toLocaleDateString(dateLocale(uiLocale))} ·{" "}
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
          {ui("วิธีตั้งค่า Google Cloud (ทำครั้งเดียว)")}
        </h2>
        <ol className="list-decimal pl-5 space-y-1 text-muted">
          <li>
            {ui("เปิด")} <strong>Google Drive API</strong> {ui("และ")}{" "}
            <strong>Google Sheets API</strong>{" "}
            {ui("ในโปรเจกต์ Google Cloud เดิม (ที่ใช้ทำ login)")}
          </li>
          <li>
            {ui("ใน OAuth consent screen →")} <strong>Data Access</strong>{" "}
            {ui("เพิ่ม scope:")}{" "}
            <code>https://www.googleapis.com/auth/drive.file</code>{" "}
            {ui("(อันเดียวพอ)")}
          </li>
          <li>
            {ui("ใน OAuth Client เพิ่ม")}{" "}
            <strong>Authorized redirect URI</strong>:
            <br />
            <code>
              https://dashboard-roan-eta-72.vercel.app/api/google/callback
            </code>{" "}
            {ui("และ")} <code>http://localhost:3000/api/google/callback</code>
          </li>
          <li>
            {ui("กลับมากดปุ่ม")}{" "}
            <strong>{ui("“เชื่อม Google Drive ของร้าน”")}</strong>{" "}
            {ui("ด้านบน → อนุญาต → กด")}{" "}
            <strong>{ui("“สร้างโครงสร้าง”")}</strong> {ui("แล้ว")}{" "}
            <strong>{ui("“ซิงค์”")}</strong>
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
