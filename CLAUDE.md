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

## Cost Setup / Revenue, COGS and OPEX

- Live P&L uses POS `netAmount` revenue and owner-entered costs for every month. Bank statements are payment reconciliation only; they never replace or add to manual costs. Legacy revenue override records are retained but no longer included in live revenue.
- `lib/cost-plan.ts` defines five COGS groups (raw ingredients, condiments, beverages, packaging, freight-in) and four OPEX groups (labor, selling/marketing, occupancy/utilities, administration). Labor is OPEX; gross profit is revenue minus COGS.
- `FixedCostCategory.icon` stores explicit `cost-setup:group:<group>` classifications. Inactive metadata categories named `__supplier_group_<id>` with icons `cost-setup:supplier-group:<id>:<group>` classify existing suppliers without schema changes. Do not count these metadata records as expenses. Classification is shared across months; amounts and supplier name overrides are monthly.
- `manual-actions.ts` validates business ownership and a revision hash, saves an entire plan atomically and preserves other months’ amounts when an item is removed. No startup migration, seed or conversion writes production data. Existing payroll/extra-pay records remain editable in the labor group.
- `pl-calc.ts`, closing breakdown and Cost Setup use the same group/bucket mapping. Daily P&L allocates monthly costs evenly over calendar days. Existing finalized snapshots are preserved and only change through the explicit reopen/refinalize workflow.
- Statement summaries retain transfers/pending classifications for cash-flow comparison. Cash movements, card repayments and owner contributions do not become POS sales or manual costs automatically.
- `test:costs` validates manual-only policy, classification, CRUD/tenancy/stale revisions, cross-report consistency and frozen snapshots with mock data only.

## จับคู่หลักฐาน

- `/bank/evidence?month=...&account=...` ใช้ DriveFile เดิมในเดือน/ธุรกิจเดียวกัน. `refType=BANK_TX`, `refId=transaction.id` คือคู่ที่ผู้ใช้ยืนยันแล้ว; ไม่มีการสร้าง/แก้ยอด BankTransaction หรือค่าใช้จ่าย.
- อ่านภาพด้วย Drive OCR (image/PDF → Google Docs → plain text) ผ่านสิทธิ์ drive.file เดิม; ย้ายเฉพาะเอกสารชั่วคราวที่เพิ่งสร้างเข้าถังขยะใน finally ไม่แตะต้นฉบับ.
- OCR cache ต่อท้าย DriveFile.note ด้วย marker `EVIDENCE_OCR_V1` โดยรักษาข้อความ/WEB_UPLOAD marker เดิม. ยอดหรือวันที่ไม่ชัดให้ผู้ใช้กรอกเอง.
- แนะนำคู่จากยอด+วันตรงและเรียงตามเวลา; โหมดตรวจเองให้ผู้ใช้ตรวจบัญชี/ผู้รับและยืนยันคู่. โหมดอัตโนมัติใช้กติกาด้านล่าง. ใบเสร็จและสลิปหลายไฟล์แนบรายการเดียวกันได้.
- `npm run test:matching` ใช้ข้อมูลจำลอง ตรวจ parser/scoping/matching/metadata และ lifecycle OCR โดยไม่แก้ production.

- Remark: `lib/evidence-category.ts` อ่านเฉพาะช่อง Remark/หมายเหตุจาก OCR เดิม แล้วแนะนำจากคำและหมวดที่มีจริงในธุรกิจ โดยพิจารณาเงินเข้า/ออก; โหมดอ่าน/แนะนำอย่างเดียวไม่ตั้งหมวด; ปุ่มตรวจทั้งเดือนใช้กติกาอัตโนมัติด้านล่าง.
- `saveEvidenceCategory` ใช้ได้หลังยืนยันคู่แล้วเท่านั้น ตรวจ business/month/category และ compare-and-set หมวด+note เดิมก่อนบันทึก. เปลี่ยนเฉพาะ categoryId + บันทึก Remark รายหลักฐาน โดยรักษา note เดิม/หลักฐานอื่น; revalidate ทุกหน้าต้นทุน/P&L.

## ตรวจหลักฐานและลงหมวดอัตโนมัติ

- ปุ่ม `/bank/evidence` ตรวจทั้งเดือนผ่านคิวในเบราว์เซอร์ทีละไฟล์ รวมทุกหน้า; เปิดหน้าไว้จนจบ. เริ่มจากการกดครั้งเดียว ไม่ต้องยืนยันทีละไฟล์.
- `lib/evidence-auto.ts` ตัดสินจาก OCR ฝั่งเซิร์ฟเวอร์: คู่ยอด+วันตรงเพียงคู่เดียว และเวลาพร้อมข้อมูลผู้รับ/บัญชี หรือ reference ตรง; Remark ต้องแนะนำได้หมวดเดียว. ตรวจเดือนปฏิทินจริงด้วย.
- คงหมวดเฉพาะเดิมที่ต่างจากคำแนะนำ และรายการที่ผู้ใช้เคยยืนยัน Remark. คู่กำกวม/ข้อมูลไม่ครบ/หมวดไม่ชัด/คนละบัญชีที่เลือกให้รอตรวจ.
- `lib/evidence-auto-service.ts` บันทึกลิงก์+categoryId+note+ผลตรวจใน Prisma transaction พร้อม compare-and-set; ไม่สร้าง BankTransaction และไม่เปลี่ยนยอด/date. เก็บ audit `EVIDENCE_AUTO_V1` ใน DriveFile.note โดยรักษา OCR/WEB_UPLOAD marker.
- ไม่มีการเปลี่ยน schema หรือ migrations. การประมวลผลข้อมูลจริงเริ่มเมื่อผู้ใช้กดปุ่ม; ทดสอบด้วยข้อมูลจำลอง.

## Editable additional costs (schema-compatible)

- `lib/flexible-costs.ts` identifies custom extra-pay and shop-cost categories using reserved `FixedCostCategory.icon` markers `cost-setup:payroll-extra[:TYPE]` / `cost-setup:other`. Amounts use `FixedCost` by business/category/month; no schema migration or automatic conversion is required.
- On explicit payroll save only, replace that month’s legacy `PayrollExtra` rows with editable categories/amounts in one transaction. Untouched historical legacy amounts remain readable. Removed built-in items retain inactive markers so they do not reappear on reload. Removing a category clears the selected month only and preserves historical amounts.
- `pl-calc.ts` and closing breakdown classify marked extra-pay amounts as Labor Extra and shop costs as Fixed/Operating. All live reports now use the manual cost plan every month; statement payments are comparison data only.
- Item names are shared across months; monthly amounts are separate. New UI labels must have Thai/English translations. Tests use mock data only (`npm run test:costs`).

## Supported account templates and account deletion

- `lib/bank-account-options.ts` is the UI/server allowlist: KBANK, SCB and Krungsri accept bank statement PDFs; cash, Grab, LINE MAN, ShopeeFood and other delivery apps are manual ledgers. New accounts use canonical codes with numeric suffixes. Existing legacy Thai `ACCT` bank names are recognized without migrating data.
- `bank/account-actions.ts` replaces the former free-text account creation and soft-delete endpoints. Deletion requires the current business, a reviewed SHA-256 preview token and the owner deletion password (`DELETE_PASSWORD`, falling back to the established approval password convention). It covers all months, rejects stale previews and finalized months, removes account transactions/openings atomically, and unlinks evidence plus automatic match metadata. Original Drive files/OCR remain for review. Hidden legacy accounts are listed in the manager for explicit cleanup.
- PDF parsing rejects unknown issuers and mismatched account banks. Parsing and import both validate the selected fiscal month; cash/delivery accounts cannot call the PDF import actions. Manual entries/opening balances validate account ownership, and manual transaction dates must match the selected month.
- Deployment does not delete, convert or otherwise alter existing production accounts. Tests (`test:accounts`) use in-memory transactions and check passwords, tenancy, preview races, rollback, closed months, supported templates, and bank/month mismatch rejection.

## Release data safety

Read `docs/data-safety.md` before deploying financial changes. Build/install must never seed, push schemas or migrate. `lib/database-safety.ts` rejects remote local-app writes and unconfigured preview connections. Do not bypass the guard using fabricated VERCEL_ENV values. Production snapshots stay outside the repository, and must be compared before/after releases. A snapshot is not proof of provider backup retention or a tested restore. Preserve the current manual-cost/POS-revenue policy in bug/UI changes.
