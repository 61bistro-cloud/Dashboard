"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { saveRevenueOverride } from "../actions";
import { MoneyInput } from "./money-input";
import { SectionCard } from "./section-card";

export function RevenueOverrideSection({
  fiscalMonthId,
  amount,
  note,
}: {
  fiscalMonthId: number;
  amount: number;
  note: string;
}) {
  const [val, setVal] = useState(amount);
  const [n, setN] = useState(note);

  return (
    <SectionCard
      icon={Wallet}
      title="Revenue Override (ใช้เมื่อ POS ยังไม่ครบ)"
      total={val}
      onSave={() =>
        saveRevenueOverride({ fiscalMonthId, amount: val, note: n })
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          ถ้าเดือนนี้ POS ยังไม่ครบ ใส่ยอดขายสุทธิรายเดือนที่นี่ —
          ระบบจะใช้ค่าที่มากกว่าระหว่าง POS sum กับ Override
        </p>
        <div className="grid grid-cols-[1fr_180px] gap-3 items-center">
          <div className="text-sm">ยอดขายสุทธิรายเดือน</div>
          <MoneyInput
            ariaLabel="Revenue Override"
            value={val}
            onChange={setVal}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">
            หมายเหตุ (option)
          </label>
          <input
            type="text"
            value={n}
            onChange={(e) => setN(e.target.value)}
            placeholder="เช่น Manual จาก Excel เดิม"
            className="w-full rounded-input border border-hairline bg-canvas px-3 py-1.5 text-sm focus:border-ink focus:outline-none  "
          />
        </div>
      </div>
    </SectionCard>
  );
}
