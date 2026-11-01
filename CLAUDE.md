# 61 Bistro — ระบบบัญชีร้านอาหาร

เว็บแอปทำบัญชีร้านอาหารไทย (รายวัน / รายเดือน / ปิดงบ / กระทบยอด POS ↔ ธนาคาร).
Deploy บน Vercel, ฐานข้อมูล Neon Postgres. UI ภาษาไทย.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** + **Tailwind v4**
- **Prisma 6** + **PostgreSQL (Neon)** — `DATABASE_URL` (pooled) + `DIRECT_URL`
- **NextAuth v5** — Google OAuth เท่านั้น (ไม่มี email/password)
- Hosted บน **Vercel** — auto-deploy เมื่อ push ขึ้น `main`

## รันบนเครื่องใหม่

1. `git clone https://github.com/61bistro-cloud/Dashboard` แล้ว `cd Dashboard`
2. สร้างไฟล์ **`.env`** (ดูตัวอย่างใน `.env.example`) — อย่างน้อยต้องมี
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`.
   ⚠️ ค่าเหล่านี้ **ไม่อยู่ใน git** — คัดลอกจากเครื่องเดิม หรือจาก Vercel → Project → Settings → Environment Variables.
3. `npm install`
4. `npx prisma generate`
5. `npm run dev` → http://localhost:3000

## Deploy

- `git push origin main` → Vercel build (`prisma generate && next build`) แล้ว deploy เอง.
- Build/deploy ไม่รัน migrations หรือ seed อัตโนมัติ; การเปลี่ยน schema ต้องดำเนินการแยกต่างหากเมื่อได้รับอนุญาต.
- **ทำงานหลายเครื่อง:** `git pull` ก่อนเริ่มทุกครั้ง และ push ให้เสร็จก่อนสลับเครื่อง (ใช้ DB + Vercel ตัวเดียวกัน).

## ก่อน push ต้องผ่าน

- `npm run typecheck` และ `npx next build` (pre-commit hook รัน prettier + tsc ให้ด้วย).

## Conventions

- ปีงบ **เม.ย.–มี.ค.** นับเป็น พ.ศ. — ดู `lib/fiscal.ts` (`calendarToFiscalIndex`, `calendarToFiscalYearBE`).
- **Multi-tenant:** ทุกตารางมี `businessId`; ใช้ `getCurrentBusiness()` / `requireBusiness()` (`lib/business.ts`). ธุรกิจปัจจุบันเก็บใน cookie.
- Mutations = **Server Actions** + Zod `safeParse` (คืน error เป็นข้อความอ่านง่าย แทนการ throw ดิบ).
- งานที่ต้องอนุมัติ (ปิดงบ / ลบหลายรายการ) ใช้รหัสเจ้าของผ่าน env `APPROVE_PASSWORD` (fallback ในโค้ด).

## นำเข้า Statement ธนาคาร (จุดที่พลาดบ่อย)

- Parser: `lib/kbank-parser.ts` รองรับ KBANK + SCB + กรุงศรี (PDF ติดรหัส = วันเกิดเจ้าของ `ddmmyyyy`).
- **ยอดคงเหลือ = `AccountOpening + Σเงินเข้า − Σเงินออก`** (`lib/bank-calc.ts`).
  ⚠️ **ห้ามลง "ยอดยกมา" เป็นรายการเงินเข้า** ถ้าตั้งช่องยอดยกมา (`AccountOpening`) ไว้แล้ว — จะนับซ้ำ ยอดเพี้ยน.
- กันรายการซ้ำตอน import: ยึด **timestamp (วันที่+เวลา) + ยอดคงเหลือ** เป็นหลัก, ใช้คำอธิบายเป็น fallback เฉพาะแถวที่ไม่มี balance (`app/(app)/bank/actions.ts`).

## เมนูหลัก

`/` Dashboard · `/daily-pl` · `/monthly-pl` · `/closing` (ปิดงบ) · `/cost-setup` · `/pos-sales` · `/bank` (กระทบยอด) · `/admin/businesses` · `/admin/users`

## Cost Setup / Statement → P&L

- `lib/statement-costs.ts` เป็น classifier/aggregation กลาง; `lib/statement-cost-data.ts` อ่าน BankTransaction แบบแยก business + fiscalMonth.
- เดือนที่มีรายการ Bank & Reconcile ใช้รายจ่ายที่จัดหมวด EXPENSE จากทุกบัญชี (รวมเงินสด/บัตร) แทนยอดกรอกเองทั้งเดือน; ไม่บวกซ้ำ. เดือนที่ยังไม่มีรายการใช้ยอดกรอกเองเดิม.
- TRANSFER, ชำระบัตรเครดิต, เงินเบิกผู้บริหาร และเงินเบิกล่วงหน้าไม่นับ P&L. เงินออกที่ไม่มีหมวดหรืออยู่หมวด INCOME แสดงเป็นรอตรวจสอบ ยังไม่นับต้นทุน.
- หมวดวัตถุดิบ/จัดซื้อ → Food, เครื่องดื่ม → Bev, แพ็คเกจจิ้ง → Pack, เงินเดือน → Labor Base, ค่าจ้าง/OT → Labor Extra, EXPENSE อื่น → Fixed/Operating. แสดง mapping ใน Cost Setup.
- Cost Setup / Dashboard / Daily P&L / Monthly P&L / breakdown ปิดงบใช้หลักเดียวกัน. Daily P&L ยังเฉลี่ยรายจ่ายทั้งเดือนตามจำนวนวัน ไม่ใช่เงินออกจริงในวันนั้น.
- อ่านคำนวณโดยตรง ไม่คัดลอก Statement ไปสร้าง payroll/purchase/fixed-cost rows. ไม่เขียนทับ snapshot ปิดงบเดิม.
- `npm run test:costs` ตรวจต้นทุนและการเชื่อม P&L ด้วยข้อมูลจำลอง ไม่ใช้ฐานข้อมูล.

## จับคู่หลักฐาน

- `/bank/evidence?month=...&account=...` ใช้ DriveFile เดิมในเดือน/ธุรกิจเดียวกัน. `refType=BANK_TX`, `refId=transaction.id` คือคู่ที่ผู้ใช้ยืนยันแล้ว; ไม่มีการสร้าง/แก้ยอด BankTransaction หรือค่าใช้จ่าย.
- อ่านภาพด้วย Drive OCR (image/PDF → Google Docs → plain text) ผ่านสิทธิ์ drive.file เดิม; ย้ายเฉพาะเอกสารชั่วคราวที่เพิ่งสร้างเข้าถังขยะใน finally ไม่แตะต้นฉบับ.
- OCR cache ต่อท้าย DriveFile.note ด้วย marker `EVIDENCE_OCR_V1` โดยรักษาข้อความ/WEB_UPLOAD marker เดิม. ยอดหรือวันที่ไม่ชัดให้ผู้ใช้กรอกเอง.
- แนะนำคู่จากยอด+วันตรงและเรียงตามเวลา; ต้องให้ผู้ใช้ตรวจบัญชี/ผู้รับและยืนยันทุกคู่. ใบเสร็จและสลิปหลายไฟล์แนบรายการเดียวกันได้.
- `npm run test:matching` ใช้ข้อมูลจำลอง ตรวจ parser/scoping/matching/metadata และ lifecycle OCR โดยไม่แก้ production.

- Remark: `lib/evidence-category.ts` อ่านเฉพาะช่อง Remark/หมายเหตุจาก OCR เดิม แล้วแนะนำจากคำและหมวดที่มีจริงในธุรกิจ โดยพิจารณาเงินเข้า/ออก; ไม่ตั้งหมวดอัตโนมัติ.
- `saveEvidenceCategory` ใช้ได้หลังยืนยันคู่แล้วเท่านั้น ตรวจ business/month/category และ compare-and-set หมวด+note เดิมก่อนบันทึก. เปลี่ยนเฉพาะ categoryId + บันทึก Remark รายหลักฐาน โดยรักษา note เดิม/หลักฐานอื่น; revalidate ทุกหน้าต้นทุน/P&L.
