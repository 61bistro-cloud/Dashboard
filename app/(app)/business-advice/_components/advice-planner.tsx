"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Target,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
import { useUi } from "@/lib/i18n/use-ui";
import {
  calculateAdvice,
  numericInput,
  type AdviceCost,
  type monthTiming,
} from "@/lib/business-advice";
type Props = {
  monthId: number;
  monthLabel: string;
  yearLabel: string;
  revenue: number;
  billCount: number;
  salesDays: number;
  costs: AdviceCost[];
  daysInMonth: number;
  timing: ReturnType<typeof monthTiming>;
  yearRows: {
    id: number;
    label: string;
    revenue: number;
    cost: number;
    profit: number;
    bills: number;
    elapsed: boolean;
  }[];
};
export function AdvicePlanner(p: Props) {
  const { ui, uiLocale } = useUi();
  const money = (n: number | null | undefined) =>
    n == null
      ? "—"
      : n.toLocaleString(uiLocale === "th" ? "th-TH" : "en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const [shares, setShares] = useState<Record<string, number>>(
    Object.fromEntries(p.costs.map((c) => [c.key, c.variable ? 100 : 0]))
  );
  const [goal, setGoal] = useState("30000"),
    [open, setOpen] = useState(String(p.daysInMonth)),
    [remaining, setRemaining] = useState(String(p.timing.remainingDays));
  const [rateOverride, setRateOverride] = useState<string | null>(null),
    [ticket, setTicket] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const totalCost = p.costs.reduce((s, c) => s + c.amount, 0);
  const fixed = p.costs.reduce(
      (s, c) => s + c.amount * (1 - shares[c.key] / 100),
      0
    ),
    variable = totalCost - fixed;
  const observed = p.revenue > 0 ? (variable / p.revenue) * 100 : null;
  const rateText =
    rateOverride === null
      ? observed === null
        ? ""
        : observed.toFixed(2)
      : rateOverride;
  const rate = numericInput(rateText),
    profitGoal = numericInput(goal),
    openDays = numericInput(open),
    remainingDays = numericInput(remaining);
  const averageObserved =
    p.billCount > 0 && p.revenue > 0 ? p.revenue / p.billCount : null;
  const average = ticket === "" ? averageObserved : numericInput(ticket);
  const inputValid =
    rate !== null &&
    profitGoal !== null &&
    openDays !== null &&
    remainingDays !== null &&
    openDays <= p.daysInMonth &&
    remainingDays <= p.timing.remainingDays &&
    (ticket === "" || average !== null);
  const calculated = inputValid
    ? calculateAdvice({
        revenue: p.revenue,
        billCount: p.billCount,
        fixed,
        variableRate: rate! / 100,
        profitGoal: profitGoal!,
        openDays: openDays!,
        remainingDays: remainingDays!,
        averageBill: average,
      })
    : null;
  const result = confirmed && totalCost > 0 ? calculated : null;
  const annual = p.yearRows
    .filter((r) => r.elapsed)
    .reduce(
      (s, r) => ({
        revenue: s.revenue + r.revenue,
        cost: s.cost + r.cost,
        bills: s.bills + r.bills,
      }),
      { revenue: 0, cost: 0, bills: 0 }
    );
  const largest = [...p.costs].sort((a, b) => b.amount - a.amount)[0];
  const field =
    "w-full min-w-0 rounded-input border border-hairline bg-canvas px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30";
  const missing = ui("ยืนยันต้นทุนและตรวจสมมติฐานเพื่อคำนวณ");
  function card(
    label: string,
    value: number | null | undefined,
    hint: string,
    icon: typeof Target
  ) {
    const Icon = icon;
    return (
      <div className="min-w-0 rounded-card border border-hairline bg-canvas p-5">
        <div className="mb-4 flex items-center justify-between gap-2 text-xs text-muted">
          <span>{ui(label)}</span>
          <Icon className="h-4 w-4" />
        </div>
        <div className="break-words text-2xl font-semibold tabular-nums tracking-tight">
          {money(value)}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-card border border-accent/20 bg-accent/5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-pill border border-accent/20 px-3 py-1 text-xs text-accent">
            <Lightbulb className="h-3.5 w-3.5" />
            {ui("วางแผนจากข้อมูลร้าน")}
          </span>
          <span className="text-xs text-muted">
            {p.monthLabel} · {ui("ประมาณการ")}
          </span>
        </div>
        <h2 className="mt-5 text-xl font-semibold sm:text-2xl">
          {ui("รู้เป้าขาย ก่อนวางแผนเดือนถัดไป")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          {ui(
            "ทดลองเป้ากำไรและจุดคุ้มทุนจากยอดขายสุทธิ ไม่แก้ข้อมูลบัญชี และไม่ถือเป็นยอดกำไรที่ปิดงบแล้ว"
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-xs">
          <Link
            className="inline-flex items-center gap-1 text-accent underline underline-offset-4"
            href={`/cost-setup?month=${p.monthId}`}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            title={ui("เปิดในแท็บใหม่")}
          >
            {ui("ตรวจต้นทุนต้นทาง")}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            className="inline-flex items-center gap-1 text-accent underline underline-offset-4"
            href={`/pos-sales?month=${p.monthId}`}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            title={ui("เปิดในแท็บใหม่")}
          >
            {ui("ตรวจยอดขายต้นทาง")}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </section>
      <p className="text-xs text-muted">
        {ui("วันที่ตรวจข้อมูล: {v0} (เวลาประเทศไทย)", { v0: p.timing.today })}{" "}
        {p.timing.phase === "future"
          ? ui("เดือนล่วงหน้า: ใช้ข้อมูลที่บันทึกสำหรับทดลองวางแผน")
          : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {card(
          "ยอดขายสุทธิที่บันทึก",
          p.revenue,
          ui("{v0} บิล · มีข้อมูลยอดขาย {v1} วัน", {
            v0: p.billCount,
            v1: p.salesDays,
          }),
          ReceiptText
        )}
        {card(
          "ต้นทุนที่กรอกไว้",
          totalCost,
          ui("ต้นทุนทั้งเดือนจากสรุปต้นทุน รวมเงินเดือน"),
          ShieldCheck
        )}
        {card(
          "กำไรตามข้อมูลที่บันทึก",
          p.revenue - totalCost,
          ui("ยังไม่ยืนยันความครบถ้วนของต้นทุน ไม่ใช่กำไรคาดการณ์"),
          Target
        )}
      </div>
      <section className="rounded-card border border-hairline bg-canvas">
        <div className="border-b border-hairline-soft p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-muted" />
            {ui("ตั้งสมมติฐานของร้าน")}
          </h2>
          <p className="mt-2 text-xs leading-5 text-muted">
            {ui(
              "สมมติฐานใช้เฉพาะหน้านี้ และเริ่มใหม่เมื่อเปิดหน้าอีกครั้ง ไม่บันทึกทับต้นทุนหรือยอดขาย"
            )}
          </p>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2 text-xs text-muted">
              <span>{ui("เป้ากำไรต่อเดือน (บาท)")}</span>
              <input
                className={field}
                type="number"
                min="0"
                max="999999999"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-xs text-muted">
              <span>{ui("วันเปิดร้านทั้งหมดในเดือน")}</span>
              <input
                className={field}
                type="number"
                min="1"
                max={p.daysInMonth}
                step="1"
                value={open}
                onChange={(e) => {
                  setOpen(e.target.value);
                  const n = numericInput(e.target.value);
                  if (n !== null && Number(remaining) > n)
                    setRemaining(String(n));
                }}
              />
            </label>
            <label className="space-y-2 text-xs text-muted">
              <span>{ui("วันเปิดร้านที่เหลือ (รวมวันนี้)")}</span>
              <input
                className={field}
                type="number"
                min="0"
                max={Math.min(
                  Number(open) || p.daysInMonth,
                  p.timing.remainingDays
                )}
                step="1"
                value={remaining}
                disabled={p.timing.phase === "past"}
                onChange={(e) => setRemaining(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-xs text-muted">
              <span>{ui("ยอดเฉลี่ยต่อบิลสมมติ (บาท)")}</span>
              <input
                className={field}
                type="number"
                min="0.01"
                step="0.01"
                placeholder={
                  averageObserved?.toFixed(2) ?? ui("ระบุเพื่อคำนวณจำนวนบิล")
                }
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
              />
            </label>
          </div>
          <details className="rounded-input border border-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
              {ui("แยกต้นทุนคงที่และผันแปร")}
              <ChevronDown className="h-4 w-4 text-muted" />
            </summary>
            <div className="space-y-3 border-t border-hairline-soft p-4">
              <p className="text-xs leading-5 text-muted">
                {ui(
                  "คงที่: จ่ายแม้ขายไม่ได้ เช่น ค่าเช่า • ผันแปร: เพิ่มตามยอดขาย เช่น วัตถุดิบหรือค่า GP • หากหมวดมีทั้งสองแบบ ให้เลือกผสมและระบุสัดส่วน"
                )}
              </p>
              {p.costs.map((c) => (
                <div
                  key={c.key}
                  className="grid items-center gap-2 border-b border-hairline-soft pb-3 sm:grid-cols-[minmax(0,1fr)_120px_155px_100px]"
                >
                  <span className="min-w-0 text-sm">{ui(c.name)}</span>
                  <span className="text-sm tabular-nums sm:text-right">
                    {money(c.amount)}
                  </span>
                  <select
                    aria-label={ui("ประเภทต้นทุน {v0}", { v0: ui(c.name) })}
                    className={field}
                    value={
                      shares[c.key] === 0
                        ? "fixed"
                        : shares[c.key] === 100
                          ? "variable"
                          : "mixed"
                    }
                    onChange={(e) =>
                      setShares({
                        ...shares,
                        [c.key]:
                          e.target.value === "fixed"
                            ? 0
                            : e.target.value === "variable"
                              ? 100
                              : 50,
                      })
                    }
                  >
                    <option value="fixed">{ui("คงที่")}</option>
                    <option value="variable">{ui("ผันแปร")}</option>
                    <option value="mixed">{ui("ผสม")}</option>
                  </select>
                  {shares[c.key] > 0 && shares[c.key] < 100 ? (
                    <label className="text-xs text-muted">
                      {ui("ผันแปร (%)")}
                      <input
                        className={field}
                        aria-label={ui("สัดส่วนผันแปร {v0}", {
                          v0: ui(c.name),
                        })}
                        type="number"
                        min="0"
                        max="100"
                        value={shares[c.key]}
                        onChange={(e) => {
                          const n = numericInput(e.target.value);
                          if (n !== null && n <= 100)
                            setShares({ ...shares, [c.key]: n });
                        }}
                      />
                    </label>
                  ) : (
                    <span className="text-xs text-muted sm:text-right">
                      {shares[c.key]}%
                    </span>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap justify-between gap-3 pt-2 text-sm">
                <span>
                  {ui("ต้นทุนคงที่สมมติ")}: <strong>{money(fixed)}</strong>
                </span>
                <span>
                  {ui("ต้นทุนผันแปรที่บันทึก")}:{" "}
                  <strong>{money(variable)}</strong>
                </span>
              </div>
            </div>
          </details>
          <div className="grid items-start gap-4 sm:grid-cols-[240px_minmax(0,1fr)]">
            <label className="space-y-2 text-xs text-muted">
              <span>{ui("อัตราต้นทุนผันแปรสมมติ (%)")}</span>
              <input
                className={field}
                type="number"
                min="0"
                aria-label={ui("อัตราต้นทุนผันแปรสมมติ (%)")}
                max="99.99"
                step="0.01"
                value={rateText}
                onChange={(e) =>
                  setRateOverride(e.target.value === "-" ? "-" : e.target.value)
                }
              />
              <button
                type="button"
                className="text-accent underline underline-offset-4"
                onClick={() => setRateOverride(null)}
              >
                {ui("ใช้สัดส่วนจากข้อมูลที่บันทึก")}
              </button>
            </label>
            <p className="pt-5 text-xs leading-6 text-muted">
              {ui(
                "ค่าเริ่มต้น = ต้นทุนผันแปรที่บันทึก ÷ ยอดขายสุทธิ ควรปรับเป็นอัตราที่คาดว่าจะเกิดจริง โดยเฉพาะเดือนที่ยอดขายยังไม่ครบ แต่กรอกต้นทุนไว้ทั้งเดือนแล้ว ค่า GP และค่าโฆษณาอาจมีพฤติกรรมต่างกัน"
              )}
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-input bg-surface p-4 text-sm leading-6">
            <input
              className="mt-1.5 h-4 w-4 shrink-0 accent-current"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              {ui(
                "ฉันตรวจต้นทุนทั้งเดือนและสมมติฐานแล้ว พร้อมใช้คำนวณประมาณการ"
              )}
              <span className="mt-1 block text-xs text-muted">
                {ui(
                  "การยืนยันนี้ใช้เฉพาะการทดลอง ไม่ใช่การปิดบัญชีหรือรับรองความครบถ้วนในระบบ"
                )}
              </span>
            </span>
          </label>
          {(totalCost === 0 || p.revenue === 0) && (
            <p className="text-sm text-amber-600" role="status">
              {ui(
                "ข้อมูลยังน้อย: ตรวจยอดขายและต้นทุนก่อนใช้คำแนะนำ หากยังไม่มียอดขาย ให้ระบุอัตราผันแปรและยอดเฉลี่ยต่อบิลเอง"
              )}
            </p>
          )}
          {confirmed && (!calculated || totalCost === 0) && (
            <p role="alert" className="text-sm text-red-600">
              {ui(
                "ยังคำนวณไม่ได้: ต้องมีต้นทุน วันเปิดร้านถูกต้อง และอัตราผันแปรตั้งแต่ 0 แต่น้อยกว่า 100% หากอัตราถึง 100% การเพิ่มยอดขายเพียงอย่างเดียวยังไม่ครอบคลุมต้นทุนคงที่"
              )}
            </p>
          )}
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {ui("เป้าหมายที่ร้านนำไปใช้ได้")}
          </h2>
          <span className="text-xs text-muted">
            {ui("ประมาณการจากสมมติฐาน ไม่ใช่การรับประกันผล")}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {card(
            "ยอดขายคุ้มทุนต่อเดือน",
            result?.breakEven,
            result
              ? ui("เฉลี่ยวันละ {v0} บาท", { v0: money(result.dailyBreakEven) })
              : missing,
            ShieldCheck
          )}
          {card(
            "ยอดขายเพื่อถึงเป้ากำไร",
            result?.target,
            result
              ? ui("เฉลี่ยวันละ {v0} บาท", { v0: money(result.dailyTarget) })
              : missing,
            Target
          )}
          {card(
            "ต้องขายต่อวันในวันที่เหลือ",
            result?.remainingTarget,
            result
              ? result.remainingTarget === null
                ? ui("ไม่มีวันเปิดร้านเหลือ จึงไม่คำนวณเป้ารายวันที่เหลือ")
                : result.remainingBills !== null
                  ? ui("ประมาณ {v0} บิลต่อวัน", { v0: result.remainingBills })
                  : ui("ระบุยอดเฉลี่ยต่อบิลเพื่อแปลงเป้าเป็นจำนวนบิล")
              : p.timing.phase === "past"
                ? ui("เดือนสิ้นสุดแล้ว ดูเป้ารายวันเฉลี่ยเพื่อวางแผน")
                : missing,
            ReceiptText
          )}
          {card(
            "ขายคุ้มทุนต่อวันในวันที่เหลือ",
            result?.remainingBreakEven,
            result
              ? result.remainingBreakEven === null
                ? ui("ไม่มีวันเปิดร้านเหลือ จึงไม่คำนวณเป้ารายวันที่เหลือ")
                : ui("หักยอดขายที่บันทึกแล้ว และหารวันเปิดร้านที่เหลือ")
              : missing,
            Target
          )}
        </div>
        {result && (
          <div className="rounded-card border border-hairline bg-canvas p-5">
            <h3 className="text-sm font-medium">
              {ui("ยอดขายที่ทำแล้ว เทียบกับเป้าหมาย")}
            </h3>
            <div className="mt-4 space-y-4">
              {[
                {
                  name: ui("ยอดขายที่บันทึก"),
                  amount: p.revenue,
                  color: "bg-accent",
                },
                {
                  name: ui("จุดคุ้มทุน"),
                  amount: result.breakEven,
                  color: "bg-amber-500",
                },
                {
                  name: ui("เป้ายอดขาย"),
                  amount: result.target,
                  color: "bg-emerald-500",
                },
              ].map((row) => (
                <div key={row.name}>
                  <div className="mb-1.5 flex justify-between gap-3 text-xs">
                    <span>{row.name}</span>
                    <strong className="tabular-nums">
                      {money(row.amount)}
                    </strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-pill bg-surface">
                    <div
                      className={`h-full rounded-pill ${row.color}`}
                      style={{
                        width: `${(Math.max(0, row.amount) / Math.max(p.revenue, result.target, result.breakEven, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-6 text-muted">
              {ui(
                "สูตร: ยอดขายคุ้มทุน = ต้นทุนคงที่ ÷ (1 − อัตราต้นทุนผันแปร) • เป้ายอดขาย = (ต้นทุนคงที่ + เป้ากำไร) ÷ (1 − อัตราต้นทุนผันแปร)"
              )}
            </p>
            {result.billsPerDay !== null && (
              <p className="mt-2 text-xs text-muted">
                {ui(
                  "เป้าเฉลี่ยทั้งเดือนประมาณ {v0} บิลต่อวัน จำนวนบิลปัดขึ้น",
                  { v0: result.billsPerDay }
                )}
              </p>
            )}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">{ui("จุดที่ควรพิจารณา")}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-card border border-hairline bg-canvas p-5">
            <span className="text-xs text-accent">01</span>
            <h3 className="mt-2 text-sm font-semibold">
              {ui("เริ่มจากต้นทุนก้อนใหญ่")}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              {largest && largest.amount > 0
                ? ui(
                    "{v0} สูงสุดที่ {v1} บาท ลองตรวจรายละเอียดก่อนลดค่าใช้จ่ายที่กระทบคุณภาพหรือบริการ",
                    { v0: ui(largest.name), v1: money(largest.amount) }
                  )
                : ui("กรอกต้นทุนก่อน เพื่อระบุหมวดที่ควรตรวจเป็นอันดับแรก")}
            </p>
          </article>
          <article className="rounded-card border border-hairline bg-canvas p-5">
            <span className="text-xs text-accent">02</span>
            <h3 className="mt-2 text-sm font-semibold">
              {ui("กำไรส่วนเกินต่อยอดขาย")}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              {result
                ? ui(
                    "ขายทุก 100 บาท เหลือ {v0} บาทหลังต้นทุนผันแปร เพื่อนำไปจ่ายต้นทุนคงที่และสร้างกำไร",
                    { v0: money(result.contribution * 100) }
                  )
                : missing}
            </p>
          </article>
          <article className="rounded-card border border-hairline bg-canvas p-5">
            <span className="text-xs text-accent">03</span>
            <h3 className="mt-2 text-sm font-semibold">
              {ui("ทดลองลดต้นทุนคงที่")}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              {result
                ? ui(
                    "หากลดต้นทุนคงที่ได้ 10% จุดคุ้มทุนจะลดลง {v0} บาทต่อเดือน ภายใต้อัตราผันแปรเดิม",
                    { v0: money(result.fixedSaving) }
                  )
                : missing}
            </p>
          </article>
        </div>
      </section>
      <section className="overflow-hidden rounded-card border border-hairline bg-canvas">
        <div className="p-5">
          <h2 className="font-semibold">
            {ui("ภาพรวมปีงบประมาณ")} {p.yearLabel}
          </h2>
          <p className="mt-2 text-xs leading-5 text-muted">
            {ui(
              "ยอดสะสมเฉพาะเดือนที่ถึงแล้ว รวมเดือนปัจจุบันที่อาจยังไม่ครบ • ใช้ต้นทุนที่บันทึก ไม่ใช่ประมาณการสิ้นปี"
            )}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              [ui("ยอดขายสะสม"), annual.revenue],
              [ui("ต้นทุนสะสม"), annual.cost],
              [ui("กำไรตามข้อมูลสะสม"), annual.revenue - annual.cost],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {money(Number(value))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[550px] text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                {[
                  "เดือน",
                  "ยอดขายสุทธิ",
                  "ต้นทุนที่กรอกไว้",
                  "กำไรตามข้อมูลที่บันทึก",
                ].map((l) => (
                  <th key={l} className="px-5 py-3 text-right first:text-left">
                    {ui(l)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.yearRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-hairline-soft ${row.id === p.monthId ? "bg-accent/5" : ""}`}
                >
                  <td className="px-5 py-3">
                    <Link
                      className="text-accent underline-offset-4 hover:underline"
                      href={`/business-advice?month=${row.id}`}
                    >
                      {row.label}
                    </Link>
                    {!row.elapsed && (
                      <span className="ml-2 text-xs text-muted">
                        {ui("ล่วงหน้า")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {money(row.revenue)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {money(row.cost)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {money(row.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs leading-6 text-muted">
        {ui(
          "ยอดขายใช้ยอดสุทธิหลังส่วนลด ไม่หักส่วนลดซ้ำ ต้นทุนเงินสดหรือเงินโอนในสเตทเมนท์ไม่ใช่ต้นทุนบัญชีทั้งหมด หน้านี้ไม่เปลี่ยนสูตรหรือยอดในรายงานเดิม"
        )}
      </p>
    </div>
  );
}
