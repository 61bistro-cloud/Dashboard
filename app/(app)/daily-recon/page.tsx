import { redirect } from "next/navigation";
import { Scale, ArrowUpRight, ArrowDownRight, Percent } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fmtTHB, getCurrentFiscalMonth } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import {
  getDailyRecon,
  RECON_CHANNELS,
  DEFAULT_LAG,
  type ChannelKey,
} from "@/lib/daily-recon";
import { MonthPicker } from "../cost-setup/_components/month-picker";
import { PageHeader } from "@/components/page-header";

export const maxDuration = 30;

type SearchParams = Promise<{
  month?: string;
  lagEDC?: string;
  lagGRAB?: string;
  lagLINEMAN?: string;
}>;

const FEE_CHANNELS = RECON_CHANNELS.filter((c) => c.fee);

export default async function DailyReconPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    redirect("/");
  }
  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={Scale} title="กระทบยอดรายวัน" />
        <p className="mt-4 text-red-600">ยังไม่มีสิทธิ์เข้าถึงธุรกิจ</p>
      </div>
    );
  }

  const sp = await searchParams;

  const allMonths = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });
  let sel =
    (sp.month ? allMonths.find((m) => m.id === Number(sp.month)) : null) ??
    null;
  if (!sel && allMonths.length > 0) {
    const latest = await prisma.posBill.findFirst({
      where: { businessId: business.id },
      orderBy: { businessDate: "desc" },
      select: { businessDate: true },
    });
    if (latest) {
      const [ly, lm] = latest.businessDate.split("-").map(Number);
      sel =
        allMonths.find(
          (m) => m.calendarYear === ly && m.calendarMonth === lm
        ) ?? null;
    }
    if (!sel) {
      const cur = await getCurrentFiscalMonth();
      sel =
        (cur ? allMonths.find((m) => m.id === cur.id) : null) ??
        allMonths[0] ??
        null;
    }
  }

  if (!sel) {
    return (
      <div className="p-8">
        <PageHeader icon={Scale} title="กระทบยอดรายวัน" />
        <p className="mt-4 text-muted">ยังไม่มีข้อมูลเดือน</p>
      </div>
    );
  }

  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 31 ? n : d;
  };
  const lag: Record<ChannelKey, number> = {
    EDC_PROMPTPAY: num(sp.lagEDC, DEFAULT_LAG.EDC_PROMPTPAY),
    GRAB: num(sp.lagGRAB, DEFAULT_LAG.GRAB),
    LINEMAN: num(sp.lagLINEMAN, DEFAULT_LAG.LINEMAN),
    CASH: 0,
  };

  const data = await getDailyRecon(business.id, sel.id, lag);
  if (!data) {
    return (
      <div className="p-8">
        <PageHeader icon={Scale} title="กระทบยอดรายวัน" />
        <p className="mt-4 text-red-600">คำนวณไม่ได้</p>
      </div>
    );
  }

  const t = data.totals;
  const totalPosFee = FEE_CHANNELS.reduce((s, c) => s + t.pos[c.key], 0);
  const totalInFee = FEE_CHANNELS.reduce((s, c) => s + t.bankIn[c.key], 0);
  const totalFee = FEE_CHANNELS.reduce((s, c) => s + t.fee[c.key], 0);
  const feePct = totalPosFee > 0 ? (totalFee / totalPosFee) * 100 : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={Scale}
        title="กระทบยอดรายวัน"
        description={`${business.name} — เทียบ POS ↔ เงินเข้าธนาคารจริง (หักค่าธรรมเนียม/GP, เข้าวันถัดไป) + ค่าใช้จ่ายรายวัน`}
        action={
          <MonthPicker
            months={allMonths.map((m) => ({
              id: m.id,
              label: `${m.label} ${m.year.yearBE}`,
            }))}
            currentId={sel.id}
          />
        }
      />

      {/* Settlement-lag settings */}
      <form className="rounded-card border border-hairline bg-surface/50 p-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="month" value={sel.id} />
        <div className="text-xs text-muted w-full">
          เงินเข้าช้ากว่าวันขายกี่วัน (ตั้งตามจริงของแต่ละร้าน) — ยอดขายวันขาย
          จะเทียบกับเงินเข้าอีก N วันถัดมา
        </div>
        <LagInput
          name="lagEDC"
          label="EDC + PromptPay"
          value={lag.EDC_PROMPTPAY}
        />
        <LagInput name="lagGRAB" label="Grab" value={lag.GRAB} />
        <LagInput name="lagLINEMAN" label="LINE MAN" value={lag.LINEMAN} />
        <button
          type="submit"
          className="rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas"
        >
          อัปเดต
        </button>
      </form>

      {totalInFee === 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>ช่อง “เข้าจริง” ยังว่าง</strong> — ตัวเลขนี้ดึงจาก statement
          ธนาคารอัตโนมัติ (ไม่ต้องกรอกเอง)
          ยังว่างเพราะเดือนนี้ยังไม่มีรายการเงินเข้าจากธนาคาร
          <br />
          👉 ไปหน้า <strong>Bank &amp; Reconcile</strong> → นำเข้า statement
          เดือนนี้ → จัดหมวดรายการ “เงินเข้า” ให้เป็นช่องทาง (Grab / LINE MAN /
          EDC-PromptPay) แล้วกลับมาหน้านี้ ตัวเลขจะขึ้นเอง
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={ArrowUpRight}
          tone="sky"
          label="ยอดขายผ่านช่องทาง (POS)"
          value={fmtTHB(totalPosFee)}
        />
        <SummaryCard
          icon={ArrowUpRight}
          tone="emerald"
          label="เงินเข้าจริง (ธนาคาร)"
          value={fmtTHB(totalInFee)}
        />
        <SummaryCard
          icon={Percent}
          tone="amber"
          label="ค่าธรรมเนียม / GP รวม"
          value={totalInFee > 0 ? fmtTHB(totalFee) : "-"}
          sub={
            totalInFee > 0
              ? feePct != null
                ? `${feePct.toFixed(2)}% ของยอดขาย`
                : undefined
              : "รอนำเข้า statement"
          }
        />
        <SummaryCard
          icon={ArrowDownRight}
          tone="red"
          label="ค่าใช้จ่ายรวม (เงินออก)"
          value={fmtTHB(t.expense)}
        />
      </div>

      {/* Daily table */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3">
          <h2 className="text-sm font-semibold">
            รายวัน — {data.month.fullLabel}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            เงินเข้าจริง = รายการเงินเข้าในธนาคารที่จัดหมวดเป็นช่องทางนั้น
            (ต้องจัดหมวดในหน้า Bank ก่อน) · ต่าง = POS − เข้าจริง
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-max text-xs">
            <thead className="bg-surface">
              <tr className="text-center">
                <th
                  rowSpan={2}
                  className="px-3 py-2 text-left sticky left-0 bg-surface z-10"
                >
                  วันที่
                </th>
                {FEE_CHANNELS.map((c) => (
                  <th
                    key={c.key}
                    colSpan={3}
                    className="px-3 py-1.5 border-l border-hairline-soft"
                  >
                    {c.label}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="px-3 py-2 border-l border-hairline-soft text-right"
                >
                  เงินสด (POS)
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2 border-l border-hairline-soft text-right"
                >
                  จ่ายออก
                </th>
              </tr>
              <tr className="text-right text-muted">
                {FEE_CHANNELS.map((c) => (
                  <ThGroup key={c.key} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {data.rows.map((r) => {
                const empty =
                  FEE_CHANNELS.every(
                    (c) => r.pos[c.key] === 0 && r.bankIn[c.key] === 0
                  ) &&
                  r.pos.CASH === 0 &&
                  r.expense === 0;
                return (
                  <tr
                    key={r.date}
                    className={empty ? "text-muted-soft" : "hover:bg-surface"}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-canvas z-10">
                      {r.date.slice(8)}{" "}
                      <span className="text-muted-soft">{r.weekday}</span>
                    </td>
                    {FEE_CHANNELS.map((c) => (
                      <Cells
                        key={c.key}
                        pos={r.pos[c.key]}
                        bankIn={r.bankIn[c.key]}
                        fee={r.fee[c.key]}
                      />
                    ))}
                    <td className="px-3 py-1.5 text-right tabular-nums border-l border-hairline-soft">
                      {r.pos.CASH > 0 ? fmtTHB(r.pos.CASH) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums border-l border-hairline-soft text-red-700">
                      {r.expense > 0 ? fmtTHB(r.expense) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface font-medium">
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-surface z-10">รวม</td>
                {FEE_CHANNELS.map((c) => (
                  <Cells
                    key={c.key}
                    pos={t.pos[c.key]}
                    bankIn={t.bankIn[c.key]}
                    fee={t.fee[c.key]}
                    bold
                  />
                ))}
                <td className="px-3 py-2 text-right tabular-nums border-l border-hairline-soft">
                  {fmtTHB(t.pos.CASH)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums border-l border-hairline-soft text-red-700">
                  {fmtTHB(t.expense)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function ThGroup() {
  return (
    <>
      <th className="px-2 py-1 border-l border-hairline-soft font-medium">
        POS
      </th>
      <th className="px-2 py-1 font-medium">เข้าจริง</th>
      <th className="px-2 py-1 font-medium">ต่าง</th>
    </>
  );
}

function Cells({
  pos,
  bankIn,
  fee,
  bold,
}: {
  pos: number;
  bankIn: number;
  fee: number;
  bold?: boolean;
}) {
  const b = bold ? "font-medium" : "";
  return (
    <>
      <td
        className={`px-2 py-1.5 text-right tabular-nums border-l border-hairline-soft ${b}`}
      >
        {pos > 0 ? fmtTHB(pos) : "-"}
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums text-emerald-700 ${b}`}
      >
        {bankIn > 0 ? fmtTHB(bankIn) : "-"}
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${b} ${
          fee > 0.01
            ? "text-amber-700"
            : fee < -0.01
              ? "text-red-700"
              : "text-muted-soft"
        }`}
      >
        {bankIn > 0 ? fmtTHB(fee) : "-"}
      </td>
    </>
  );
}

function LagInput({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <label className="text-xs">
      <span className="block text-muted mb-0.5">{label} (วัน)</span>
      <input
        type="number"
        name={name}
        defaultValue={value}
        min={0}
        max={31}
        className="w-20 rounded border border-hairline-soft bg-canvas px-2 py-1"
      />
    </label>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Percent;
  tone: "sky" | "emerald" | "amber" | "red";
  label: string;
  value: string;
  sub?: string;
}) {
  const cls = {
    sky: "text-sky-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];
  return (
    <div className="rounded-card border border-hairline bg-canvas p-4">
      <Icon className={`h-5 w-5 ${cls}`} strokeWidth={1.75} />
      <div className="mt-2 text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-soft">{sub}</div>}
    </div>
  );
}
