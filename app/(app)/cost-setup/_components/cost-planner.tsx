"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useUi } from "@/lib/i18n/use-ui";
import {
  COST_GROUPS,
  type CostPlanItem,
  type CostGroup,
} from "@/lib/cost-plan";
import { saveManualCostPlan } from "../manual-actions";
import { MoneyInput, fmt } from "./money-input";

export type RevenueSource = {
  channel: string;
  payment: string;
  count: number;
  amount: number;
};
export function CostPlanner({
  businessId,
  monthId,
  items: initial,
  revision: initialRevision,
  laborBase,
  laborExtra,
  revenue,
  payrollEditor,
}: {
  businessId: number;
  monthId: number;
  items: CostPlanItem[];
  revision: string;
  laborBase: number;
  laborExtra: number;
  revenue: RevenueSource[];
  payrollEditor: React.ReactNode;
}) {
  const { ui } = useUi();
  const [items, setItems] = useState(initial),
    [revision, setRevision] = useState(initialRevision),
    [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition(),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    setItems(initial);
    setRevision(initialRevision);
    setDirty(false);
  }, [initialRevision]);
  const sum = (rows: { amount: number }[]) =>
    rows.reduce((n, r) => n + Math.round(r.amount * 100), 0) / 100;
  const revenueTotal = sum(revenue),
    cogs = sum(
      items.filter(
        (r) => COST_GROUPS.find((g) => g.id === r.group)?.section === "cogs"
      )
    );
  const opex =
    sum(
      items.filter(
        (r) => COST_GROUPS.find((g) => g.id === r.group)?.section === "opex"
      )
    ) +
    laborBase +
    laborExtra;
  const labor =
    laborBase + laborExtra + sum(items.filter((r) => r.group === "labor"));
  const change = (next: CostPlanItem[]) => {
    setItems(next);
    setDirty(true);
    setSaved(false);
    setError(null);
  };
  const edit = (index: number, update: Partial<CostPlanItem>) =>
    change(items.map((r, i) => (i === index ? { ...r, ...update } : r)));
  const invalid = items.some(
    (r) => !r.name.trim() || !Number.isFinite(r.amount) || r.amount < 0
  );
  function groups(section: "cogs" | "opex") {
    return COST_GROUPS.filter((g) => g.section === section).map((group) => {
      const rows = items
        .map((item, index) => ({ item, index }))
        .filter((r) => r.item.group === group.id);
      const subtotal =
        sum(rows.map((r) => r.item)) +
        (group.id === "labor" ? laborBase + laborExtra : 0);
      return (
        <details
          key={group.id}
          className="rounded-input border border-hairline bg-canvas"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 text-sm font-medium">
            <span>{ui(group.label)}</span>
            <span className="inline-flex shrink-0 items-center gap-2 tabular-nums">
              {fmt(subtotal)}
              <ChevronDown
                aria-hidden="true"
                className="h-3.5 w-3.5 text-muted"
              />
            </span>
          </summary>
          <div className="space-y-3 border-t border-hairline-soft p-3 sm:p-4">
            <p className="text-xs text-muted">{ui(group.hint)}</p>
            {group.id === "admin" && (
              <p className="text-xs text-muted">
                {ui(
                  "กรอกค่าเสื่อมราคาเฉพาะส่วนของเดือน ไม่ใช่ราคาซื้อทรัพย์สินทั้งหมด"
                )}
              </p>
            )}
            {group.id === "selling" && (
              <p className="text-xs text-muted">
                {ui(
                  "ส่วนลดในบิลหักในยอดขายสุทธิแล้ว ไม่ต้องกรอกเป็นค่าใช้จ่ายซ้ำ"
                )}
              </p>
            )}
            {group.id === "labor" && (
              <>
                <p
                  className={`text-xs ${revenueTotal > 0 && labor / revenueTotal > 0.25 ? "text-amber-700" : "text-muted"}`}
                >
                  {ui("ค่าแรงต่อยอดขาย {v0} • เป้าหมาย 15–25%", {
                    v0:
                      revenueTotal > 0
                        ? `${((labor / revenueTotal) * 100).toFixed(1)}%`
                        : "—",
                  })}
                </p>
                {payrollEditor}
                <p className="text-xs font-medium">
                  {ui("รายการพนักงานเพิ่มเติม เช่น ประกันสังคมและสวัสดิการ")}
                </p>
              </>
            )}
            {rows.map(({ item, index }) => (
              <div
                key={item.id ? `${item.source}-${item.id}` : `new-${index}`}
                className="rounded-input border border-hairline-soft p-3"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_100px_28px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_140px_28px]">
                  <input
                    aria-label={ui("ชื่อรายการ {v0}", { v0: index + 1 })}
                    maxLength={120}
                    value={item.name}
                    disabled={pending}
                    onChange={(e) => edit(index, { name: e.target.value })}
                    placeholder={ui("ชื่อรายการ")}
                    className="min-w-0 rounded-input border border-hairline bg-canvas px-2 py-2 text-sm"
                  />
                  <MoneyInput
                    value={item.amount}
                    ariaLabel={ui("จำนวนเงิน {v0}", {
                      v0: item.name || index + 1,
                    })}
                    onChange={(amount) => edit(index, { amount })}
                  />
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={ui("ลบรายการ {v0}", {
                      v0: item.name || index + 1,
                    })}
                    onClick={() => {
                      if (
                        confirm(
                          ui("ลบรายการนี้? การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึก")
                        )
                      )
                        change(items.filter((_, i) => i !== index));
                    }}
                    className="p-1 text-muted hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {ui("หมวดต้นทุน")}
                  <select
                    aria-label={ui("หมวดของ {v0}", {
                      v0: item.name || index + 1,
                    })}
                    value={item.group}
                    disabled={pending}
                    onChange={(e) =>
                      edit(index, { group: e.target.value as CostGroup })
                    }
                    className="max-w-full rounded-input border border-hairline bg-canvas px-2 py-1 text-xs"
                  >
                    {COST_GROUPS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {ui(g.label)}
                      </option>
                    ))}
                  </select>
                  <span>
                    {ui(
                      item.source === "supplier"
                        ? "รายการผู้จำหน่ายเดิม"
                        : "รายการค่าใช้จ่าย"
                    )}
                  </span>
                </label>
              </div>
            ))}
            {!rows.length && (
              <p className="text-xs text-muted">
                {ui("ยังไม่มีรายการ เพิ่มรายการด้านล่างได้เลย")}
              </p>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                change([
                  ...items,
                  { source: "category", name: "", amount: 0, group: group.id },
                ])
              }
              className="inline-flex items-center gap-2 rounded-input border border-hairline px-3 py-2 text-xs hover:bg-surface"
            >
              <Plus className="h-3.5 w-3.5" />
              {ui("เพิ่มรายการใน {v0}", { v0: ui(group.label) })}
            </button>
          </div>
        </details>
      );
    });
  }
  return (
    <section
      className="space-y-4"
      aria-label={ui("รายได้และต้นทุนสำหรับกำไรขาดทุน")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold">
            {ui("รายได้และต้นทุนสำหรับกำไรขาดทุน")}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {ui(
              "รายได้จากยอดขายหน้าร้าน • ต้นทุนจากเจ้าของกรอกเองทุกเดือน • Statement ใช้ตรวจเทียบเท่านั้น"
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={pending || !dirty || invalid}
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                const result = await saveManualCostPlan({
                  businessId,
                  fiscalMonthId: monthId,
                  revision,
                  items,
                });
                if (!result.ok) setError(result.message);
                else {
                  setItems(result.items);
                  setRevision(result.revision);
                  setDirty(false);
                  setSaved(true);
                }
              } catch {
                setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
              }
            });
          }}
          className="rounded-pill bg-ink px-4 py-2 text-sm text-canvas disabled:opacity-40"
        >
          {ui(pending ? "กำลังบันทึก…" : "บันทึกต้นทุน")}
        </button>
      </div>
      <p className="text-xs text-muted">
        {ui(
          "เงินเดือนและค่าจ้างพิเศษให้บันทึกในส่วนค่าแรง ส่วนรายการอื่นใช้ปุ่มบันทึกต้นทุน"
        )}
      </p>
      {dirty && (
        <p role="status" className="text-xs text-amber-700">
          {ui("มีการแก้ไขที่ยังไม่บันทึก • กดบันทึกต้นทุนเพื่ออัปเดตรายงาน")}
        </p>
      )}
      {invalid && (
        <p className="text-xs text-amber-700">
          {ui("กรอกชื่อรายการและจำนวนเงินให้ครบก่อนบันทึก")}
        </p>
      )}
      {saved && (
        <p role="status" className="text-xs text-emerald-600">
          {ui("บันทึกต้นทุนแล้ว รายงานใช้ยอดกรอกเองที่บันทึกไว้")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {ui(error)}
        </p>
      )}
      <p className="text-xs text-muted">
        {ui(
          "ใช้ยอดกรอกเองเดิมและรายการใหม่ที่บันทึก • ไม่ดึงยอด Statement มาแทนต้นทุน"
        )}
      </p>
      <div className="grid gap-4">
        <details className="rounded-card border border-hairline bg-canvas">
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-base font-semibold">{ui("1. รายได้")}</h3>
              <p className="mt-1 text-xs text-muted">
                {ui("ยอดขายสุทธิจากยอดขายหน้าร้าน")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <strong className="tabular-nums">{fmt(revenueTotal)}</strong>
              <ChevronDown className="h-4 w-4 text-muted" />
            </div>
          </summary>
          <div className="space-y-3 border-t border-hairline-soft p-4">
            <Link
              href={`/pos-sales?month=${monthId}`}
              className="text-xs underline"
            >
              {ui("ตรวจบิลต้นทางในยอดขายหน้าร้าน")}
            </Link>
            {!revenue.length ? (
              <p className="text-xs text-muted">
                {ui("ยังไม่มีข้อมูลยอดขายหน้าร้านในเดือนนี้")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface text-left">
                    <tr>
                      <th className="p-2">{ui("ช่องทาง / วิธีชำระ")}</th>
                      <th className="p-2 text-right">{ui("บิล")}</th>
                      <th className="p-2 text-right">{ui("ยอดขายสุทธิ")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.map((row, i) => (
                      <tr key={i} className="border-b border-hairline-soft">
                        <td className="p-2">
                          {row.channel} / {row.payment}
                        </td>
                        <td className="p-2 text-right">{row.count}</td>
                        <td className="p-2 text-right tabular-nums">
                          {fmt(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted">
              {ui(
                "ใช้ยอดสุทธิในบิล ไม่บวกรายรับธนาคารหรือยอดปรับรายได้เดิมซ้ำ"
              )}
            </p>
          </div>
        </details>
        <details className="rounded-card border border-hairline bg-canvas">
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-base font-semibold">{ui("2. ต้นทุนขาย")}</h3>
              <p className="mt-1 text-xs text-muted">
                {ui(
                  "วัตถุดิบ เครื่องปรุง เครื่องดื่ม บรรจุภัณฑ์ และขนส่งวัตถุดิบ"
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <strong className="tabular-nums">{fmt(cogs)}</strong>
              <ChevronDown className="h-4 w-4 text-muted" />
            </div>
          </summary>
          <fieldset
            disabled={pending}
            className="min-w-0 space-y-3 border-t border-hairline-soft p-3 sm:p-4"
          >
            {groups("cogs")}
          </fieldset>
        </details>
        <details className="rounded-card border border-hairline bg-canvas">
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-5">
            <div>
              <h3 className="text-base font-semibold">
                {ui("3. ค่าใช้จ่ายในการดำเนินงาน")}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {ui("พนักงาน การตลาด สถานที่ และบริหาร")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <strong className="tabular-nums">{fmt(opex)}</strong>
              <ChevronDown className="h-4 w-4 text-muted" />
            </div>
          </summary>
          <fieldset
            disabled={pending}
            className="min-w-0 space-y-3 border-t border-hairline-soft p-3 sm:p-4"
          >
            {groups("opex")}
          </fieldset>
        </details>
      </div>
      <div className="flex flex-wrap justify-between gap-2 rounded-input bg-surface p-4 text-sm">
        <span>
          {ui("กำไรสุทธิ = รายได้ − ต้นทุนขาย − ค่าใช้จ่ายดำเนินงาน")}
        </span>
        <strong
          className={`tabular-nums ${revenueTotal - cogs - opex < 0 ? "text-red-600" : "text-emerald-600"}`}
        >
          {fmt(revenueTotal - cogs - opex)}
        </strong>
      </div>
      {revenueTotal > 0 && cogs + opex === 0 && (
        <p role="alert" className="text-xs text-amber-700">
          {ui(
            "ยังไม่ได้กรอกต้นทุน กำไรที่แสดงยังไม่รวมค่าใช้จ่าย กรุณากรอกให้ครบก่อนใช้งบ"
          )}
        </p>
      )}
      <p className="text-xs text-muted">
        {ui(
          "ยอดเงินและชื่อผู้จำหน่ายใช้เฉพาะเดือนที่เลือก • ชื่อรายการค่าใช้จ่ายและการจัดหมวดใช้ร่วมกันทุกเดือน • ลบรายการแล้วจะซ่อนจากเดือนถัดไป โดยเก็บยอดเดือนอื่นไว้"
        )}
      </p>
    </section>
  );
}
