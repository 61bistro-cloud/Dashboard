"use client";
import { useState, useTransition } from "react";
import { useUi } from "@/lib/i18n/use-ui";
import { createTrialCustomer } from "../customer-actions";
import { UserPlus, Copy, CheckCircle2 } from "lucide-react";
export function CustomerOnboarding() {
  const { ui } = useUi();
  const [businessName, setBusinessName] = useState(""),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [review, setReview] = useState(false),
    [message, setMessage] = useState(""),
    [copied, setCopied] = useState(false),
    [created, setCreated] = useState<{
      businessName: string;
      email: string;
    } | null>(null),
    [pending, start] = useTransition();
  function edit(fn: () => void) {
    fn();
    setCopied(false);
    setReview(false);
    setCreated(null);
    setMessage("");
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setCreated(null);
    setReview(true);
  }
  function create() {
    start(async () => {
      try {
        const r = await createTrialCustomer({ businessName, email, name });
        if (!r.ok) {
          setMessage(r.message);
          return;
        }
        setCreated(r);
        setReview(false);
        setBusinessName("");
        setEmail("");
        setName("");
      } catch {
        setMessage("สร้างบัญชีลูกค้าไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่");
      }
    });
  }
  return (
    <section className="rounded-card border border-hairline bg-canvas p-4 sm:p-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="h-4 w-4" />
        {ui("เพิ่มลูกค้าทดลอง — ธุรกิจใหม่")}
      </h2>
      <p className="text-xs text-muted leading-6">
        {ui(
          "สร้างพื้นที่ธุรกิจใหม่และบัญชีเจ้าของร้าน ลูกค้าจะเห็นเฉพาะธุรกิจของตนเอง ไม่คัดลอกยอดขาย ต้นทุน บัญชีธนาคาร หรือการเชื่อมต่อจากร้านเดิม"
        )}
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs space-y-1">
          {ui("ชื่อธุรกิจลูกค้า")}
          <input
            required
            maxLength={80}
            value={businessName}
            disabled={pending}
            onChange={(e) => edit(() => setBusinessName(e.target.value))}
            className="block w-full rounded-input border border-hairline bg-canvas p-2 text-sm"
          />
        </label>
        <label className="text-xs space-y-1">
          {ui("อีเมล Google ของลูกค้า")}
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            disabled={pending}
            onChange={(e) => edit(() => setEmail(e.target.value))}
            className="block w-full rounded-input border border-hairline bg-canvas p-2 text-sm"
          />
        </label>
        <label className="text-xs space-y-1">
          {ui("ชื่อแสดงผล (ไม่บังคับ)")}
          <input
            maxLength={80}
            value={name}
            disabled={pending}
            onChange={(e) => edit(() => setName(e.target.value))}
            className="block w-full rounded-input border border-hairline bg-canvas p-2 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            disabled={pending}
            className="rounded-pill border border-hairline px-4 py-2 text-sm disabled:opacity-50"
          >
            {ui("ตรวจข้อมูลก่อนสร้าง")}
          </button>
        </div>
      </form>
      {review && (
        <div className="rounded-input border border-hairline bg-surface p-4 text-sm space-y-3">
          <p className="font-medium break-words">{businessName.trim()}</p>
          <p className="break-all">{email.trim().toLowerCase()}</p>
          <p className="text-xs text-muted leading-6">
            {ui(
              "เจ้าของร้านเข้าถึงเฉพาะธุรกิจใหม่ ผู้ดูแลระบบยังช่วยดูแลได้ เริ่มต้นโดยไม่มีรายการเงินจริง และไม่มีวันหมดอายุอัตโนมัติจนกว่าจะกำหนดแพ็กเกจ"
            )}
          </p>
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="rounded-pill bg-ink text-canvas px-4 py-2 text-sm disabled:opacity-50"
          >
            {ui(pending ? "กำลังสร้างบัญชีลูกค้า…" : "ยืนยันสร้างบัญชีลูกค้า")}
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-red-600">
          {ui(message)}
        </p>
      )}
      {created && (
        <div
          role="status"
          className="rounded-input border border-hairline p-4 space-y-2"
        >
          <h3 className="flex gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            {ui("บัญชีลูกค้าพร้อมใช้งาน")}
          </h3>
          <p className="text-sm break-words">
            {created.businessName} · {created.email}
          </p>
          <p className="text-xs leading-6">
            {ui(
              "ให้ลูกค้าเปิดลิงก์ด้านล่าง แล้วกดเข้าสู่ระบบด้วย Google โดยเลือกอีเมลนี้ ไม่ต้องสร้างรหัสผ่านใหม่"
            )}
          </p>
          <a
            href="/sign-in"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs underline break-all"
          >
            {typeof window !== "undefined" ? window.location.origin : ""}
            /sign-in
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  window.location.origin + "/sign-in"
                );
                setCopied(true);
              } catch {
                setMessage("คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้านบน");
              }
            }}
            className="inline-flex items-center gap-2 rounded-pill border border-hairline px-3 py-2 text-xs"
          >
            <Copy className="h-3 w-3" />
            {ui(copied ? "คัดลอกลิงก์เข้าสู่ระบบแล้ว" : "คัดลอกลิงก์ให้ลูกค้า")}
          </button>
          <p className="text-xs text-muted">
            {ui("ระบบไม่ได้ส่งอีเมลให้ลูกค้าอัตโนมัติ")}
          </p>
        </div>
      )}
      <details className="text-xs leading-6 text-muted">
        <summary className="cursor-pointer">
          {ui("ลูกค้าเริ่มใช้งานอย่างไร และข้อมูลเก็บที่ไหน")}
        </summary>
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>
            {ui(
              "ใช้บัญชี Google ที่ผู้ดูแลเพิ่มไว้ เข้าลิงก์เดียวกัน แต่แต่ละรายเห็นเฉพาะธุรกิจที่ได้รับสิทธิ์"
            )}
          </li>
          <li>
            {ui(
              "เพิ่มบัญชีธนาคารและช่องทางของร้านเอง แล้วนำเข้า POS หรือรายการเดินบัญชีของร้านนั้น"
            )}
          </li>
          <li>
            {ui(
              "ข้อมูลตัวเลขเก็บในฐานข้อมูลกลาง แยกด้วยรหัสธุรกิจและตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ เอกสารเชื่อม Google Drive และ LINE แยกต่อธุรกิจ"
            )}
          </li>
          <li>
            {ui(
              "หาก Google แจ้งว่าแอปอยู่ในช่วงทดสอบ ให้เพิ่มอีเมลลูกค้าในผู้ใช้ทดสอบของ Google Cloud ก่อนลองใหม่"
            )}
          </li>
        </ol>
      </details>
    </section>
  );
}
