"use client";
import { useEffect, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/i18n/use-ui";
import {
  DOCUMENT_GROUP_LABELS,
  type DocumentReview,
} from "@/lib/document-review";
import { reviewEvidenceDocument } from "../actions";
const statusLabels = {
  pending: "รอคัดกรอง",
  rules: "ตรวจด้วยกฎแล้ว",
  not_configured: "ยังไม่ได้ตั้งค่า OpenRouter API key",
  not_enabled: "ยังไม่เปิด AI ให้ธุรกิจนี้",
  complete: "AI เสนอข้อมูลแล้ว รอยืนยัน",
  unavailable: "AI ไม่พร้อมหรือโควตาหมด ใช้ผล OCR และรอตรวจ",
  invalid: "AI ตอบไม่ตรงรูปแบบ ใช้ผล OCR และรอตรวจ",
};
const flags: Record<string, string> = {
  business_relevance_unverified:
    "ตรวจว่ารายการเกี่ยวกับธุรกิจนี้จริง การส่งเข้า LINE ไม่ใช่การยืนยันบัญชีร้าน",
  missing_amount: "ยังอ่านยอดเงินไม่ครบ",
  missing_date: "ยังอ่านวันที่ไม่ครบ",
  unclear_category: "ยังแยกหมวดไม่ชัด",
  different_month: "วันที่เอกสารไม่ตรงเดือนที่เก็บ กรุณาตรวจเดือน",
  amount_conflict: "AI และ OCR อ่านยอดเงินต่างกัน",
  date_conflict: "AI และ OCR อ่านวันที่ต่างกัน",
  same_payment_reference:
    "มีหลักฐานเลขอ้างอิงเดียวกัน อาจเป็นการจ่ายครั้งเดียว",
  same_qr_review:
    "มี QR เดียวกับหลักฐานอื่น อาจเป็น QR ร้านค้าเดิม ไม่ใช่ข้อสรุปว่าเอกสารซ้ำ",
  ocr_or_processing_failed: "อ่านเอกสารไม่สำเร็จ ลองใหม่หรือกรอกเอง",
};
export function DocumentReviewPanel({
  businessId,
  monthId,
  fileId,
  review: initial,
  disabled = false,
  onUse,
}: {
  businessId: number;
  monthId: number;
  fileId: number;
  review?: DocumentReview | null;
  disabled?: boolean;
  onUse?: (r: DocumentReview) => void;
}) {
  const { ui } = useUi(),
    router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => setResult(initial), [initial]);
  const r = result ?? initial;
  return (
    <div className="space-y-3 rounded-input border border-hairline bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{ui("คัดกรองเอกสาร OCR + AI")}</strong>
        <button
          type="button"
          className="rounded-pill border border-hairline px-3 py-2 disabled:opacity-50"
          disabled={pending || disabled}
          onClick={() =>
            start(async () => {
              setError("");
              try {
                const answer = await reviewEvidenceDocument({
                  businessId,
                  monthId,
                  fileId,
                });
                if (answer.ok) {
                  setResult(answer.review);
                  router.refresh();
                } else setError(answer.message);
              } catch {
                setError("คัดกรองไม่สำเร็จ กรุณาลองใหม่ เอกสารต้นฉบับยังอยู่");
              }
            })
          }
        >
          {ui(pending ? "กำลังคัดกรอง..." : "คัดกรอง / ลองใหม่")}
        </button>
      </div>
      <p className="text-muted">
        {ui(
          "ผลเสนอแนะเท่านั้น ไม่ลงหมวดธนาคาร ไม่เพิ่มต้นทุน และไม่ยืนยันว่าสลิปแท้"
        )}
      </p>
      {r && (
        <>
          <p>
            {ui(statusLabels[r.ai] ?? "รอคัดกรอง")}
            {r.state === "failed" ? ` · ${ui("รอตรวจด้วยตนเอง")}` : ""}
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted">{ui("ประเภทเอกสาร")}</dt>
              <dd>
                {ui(
                  {
                    slip: "สลิปโอนเงิน",
                    receipt: "ใบเสร็จ / ใบกำกับภาษี",
                    other: "เอกสารอื่น",
                    unknown: "ยังไม่ทราบประเภท",
                  }[r.kind]
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{ui("หมวดที่เสนอ")}</dt>
              <dd>{ui(DOCUMENT_GROUP_LABELS[r.group])}</dd>
            </div>
            <div>
              <dt className="text-muted">{ui("ยอดเงิน / วันที่ที่เสนอ")}</dt>
              <dd>
                {r.amount ?? "—"} · {r.date ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{ui("ผู้ขาย / เลขอ้างอิง")}</dt>
              <dd className="break-words">
                {r.merchant ?? "—"} · {r.reference ?? "—"}
              </dd>
            </div>
          </dl>
          {r.remark && <p className="break-words">{r.remark}</p>}
          <ul className="space-y-1 text-amber-700">
            {r.flags
              .filter((f) => f !== "human_confirmation_required")
              .map((f) => (
                <li key={f}>
                  {ui(
                    flags[f] ?? "มีข้อมูลที่ AI อ้างอิงไม่ครบ กรุณาตรวจต้นฉบับ"
                  )}
                </li>
              ))}
          </ul>
          {r.duplicateIds.length > 0 && (
            <p>
              {ui("หลักฐานที่ควรตรวจร่วมกัน")}:{" "}
              {r.duplicateIds.map((id) => `#${id}`).join(", ")} ·{" "}
              {ui(
                "สลิปกับใบเสร็จอาจเป็นหลักฐานของค่าใช้จ่ายเดียวกัน อย่าบวกต้นทุนซ้ำ"
              )}
            </p>
          )}
          {Object.keys(r.quotes).length > 0 && (
            <details>
              <summary className="cursor-pointer underline">
                {ui("ข้อความต้นทางที่ใช้เสนอ")}
              </summary>
              <ul className="mt-2 space-y-2">
                {Object.entries(r.quotes).map(([key, quote]) => (
                  <li
                    key={key}
                    className="break-words border-l-2 border-hairline pl-2"
                  >
                    {quote}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {onUse && r.state === "review" && (
            <button
              type="button"
              disabled={disabled || pending}
              onClick={() => onUse(r)}
              className="rounded-pill border border-hairline px-3 py-2"
            >
              {ui("ใช้ข้อมูลเสนอเพื่อค้นหาคู่ ยังไม่บันทึกบัญชี")}
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {ui(error)}
        </p>
      )}
    </div>
  );
}
