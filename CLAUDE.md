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

- `git push origin main` → Vercel build (`prisma generate && prisma migrate deploy && next build`) แล้ว deploy เอง.
- DB migration: เพิ่มโฟลเดอร์ใน `prisma/migrations/` — `prisma migrate deploy` จะรันตอน build.
- **ทำงานหลายเครื่อง:** `git pull` ก่อนเริ่มทุกครั้ง และ push ให้เสร็จก่อนสลับเครื่อง (ใช้ DB + Vercel ตัวเดียวกัน).

## ก่อน push ต้องผ่าน

- `npm run typecheck` และ `npx next build` (pre-commit hook รัน prettier + tsc ให้ด้วย).

## Conventions

- ปีงบ **เม.ย.–มี.ค.** นับเป็น พ.ศ. — ดู `lib/fiscal.ts` (`calendarToFiscalIndex`, `calendarToFiscalYearBE`).
- **Multi-tenant:** ทุกตารางมี `businessId`; ใช้ `getCurrentBusiness()` / `requireBusiness()` (`lib/business.ts`). ธุรกิจปัจจุบันเก็บใน cookie.
- Mutations = **Server Actions** + Zod `safeParse` (คืน error เป็นข้อความอ่านง่าย แทนการ throw ดิบ).
- งานที่ต้องอนุมัติ (ปิดงบ / ลบหลายรายการ) ใช้รหัสเจ้าของผ่าน env `APPROVE_PASSWORD` (fallback ในโค้ด).

## นำเข้า Statement ธนาคาร (จุดที่พลาดบ่อย)

- Parser: `lib/kbank-parser.ts` รองรับ KBANK + SCB (PDF ติดรหัส = วันเกิดเจ้าของ `ddmmyyyy`).
- **ยอดคงเหลือ = `AccountOpening + Σเงินเข้า − Σเงินออก`** (`lib/bank-calc.ts`).
  ⚠️ **ห้ามลง "ยอดยกมา" เป็นรายการเงินเข้า** ถ้าตั้งช่องยอดยกมา (`AccountOpening`) ไว้แล้ว — จะนับซ้ำ ยอดเพี้ยน.
- กันรายการซ้ำตอน import: ยึด **timestamp (วันที่+เวลา) + ยอดคงเหลือ** เป็นหลัก, ใช้คำอธิบายเป็น fallback เฉพาะแถวที่ไม่มี balance (`app/(app)/bank/actions.ts`).

## เมนูหลัก

`/` Dashboard · `/daily-pl` · `/monthly-pl` · `/closing` (ปิดงบ) · `/cost-setup` · `/pos-sales` · `/bank` (กระทบยอด) · `/admin/businesses` · `/admin/users`
