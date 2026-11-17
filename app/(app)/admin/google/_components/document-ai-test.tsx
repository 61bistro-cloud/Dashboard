"use client";
import { useState, useTransition } from "react";
import { useUi } from "@/lib/i18n/use-ui";
import { testDocumentAi } from "../document-actions";
export function DocumentAiTest({
  businessId,
  enabled,
}: {
  businessId: number;
  enabled: boolean;
}) {
  const { ui } = useUi();
  const [pending, start] = useTransition(),
    [status, setStatus] = useState("");
  const labels: Record<string, string> = {
    complete: "เชื่อมต่อโมเดลฟรีและตรวจรูปแบบผลลัพธ์ได้แล้ว",
    not_configured: "ยังไม่ได้ตั้งค่า OpenRouter API key",
    not_enabled: "ยังไม่เปิด AI ให้ธุรกิจนี้",
    invalid: "AI ตอบไม่ตรงรูปแบบ ใช้ผล OCR และรอตรวจ",
    unavailable: "AI ไม่พร้อมหรือโควตาหมด ใช้ผล OCR และรอตรวจ",
    forbidden: "ไม่มีสิทธิ์ทดสอบ AI",
  };
  return (
    <div className="space-y-2">
      <button
        className="rounded-pill border border-hairline px-3 py-2 text-xs disabled:opacity-50"
        type="button"
        disabled={!enabled || pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await testDocumentAi(businessId);
              setStatus(r.status);
            } catch {
              setStatus("unavailable");
            }
          })
        }
      >
        {ui(pending ? "กำลังทดสอบ..." : "ทดสอบ AI ด้วยข้อความตัวอย่าง")}
      </button>
      <p className="text-xs text-muted">
        {ui("ปุ่มทดสอบส่งเฉพาะข้อความสมมติ ไม่มีรูปหรือข้อมูลบัญชีจริง")}
      </p>
      {status && (
        <p role="status" className="text-xs">
          {ui(labels[status] ?? labels.unavailable)}
        </p>
      )}
    </div>
  );
}
