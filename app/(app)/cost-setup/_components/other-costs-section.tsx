"use client";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useUi } from "@/lib/i18n/use-ui";
import {
  validateFlexibleCostRows,
  type FlexibleCostRow,
} from "@/lib/flexible-costs";
import { saveOtherCosts } from "../actions";
import { SectionCard } from "./section-card";
import { EditableCostRows } from "./editable-cost-rows";
export function OtherCostsSection({
  fiscalMonthId,
  items,
}: {
  fiscalMonthId: number;
  items: FlexibleCostRow[];
}) {
  const { ui } = useUi();
  const [rows, setRows] = useState(items);
  useEffect(() => setRows(items), [items]);
  return (
    <SectionCard
      icon={ShoppingBag}
      title={ui("ต้นทุนอื่นๆ / ซื้อของเข้าร้าน")}
      total={rows.reduce((sum, row) => sum + row.amount, 0)}
      onSave={() => {
        validateFlexibleCostRows(rows);
        return saveOtherCosts({ fiscalMonthId, rows });
      }}
    >
      <p className="mb-4 text-xs text-muted">
        {ui(
          "เช่น ของใช้ อุปกรณ์ หรือวัสดุสิ้นเปลืองในร้าน • รวมเป็นค่าใช้จ่ายดำเนินงานในรายงาน ไม่ใช่ต้นทุนวัตถุดิบอาหาร"
        )}
      </p>
      <EditableCostRows rows={rows} onChange={setRows} kind="other" />
    </SectionCard>
  );
}
