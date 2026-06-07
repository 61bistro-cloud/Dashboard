"use client";

import { useState, useTransition } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { addTransaction } from "../actions";

type Cat = {
  id: number;
  name: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER";
};

export function AddTransactionForm({
  fiscalMonthId,
  accountId,
  defaultDate,
  categories,
}: {
  fiscalMonthId: number;
  accountId: number;
  defaultDate: string;
  categories: Cat[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [desc, setDesc] = useState("");
  const [deposit, setDeposit] = useState("");
  const [withdraw, setWithdraw] = useState("");
  const [channel, setChannel] = useState("");
  const [catId, setCatId] = useState<string>("");

  const reset = () => {
    setDesc("");
    setDeposit("");
    setWithdraw("");
    setChannel("");
    setCatId("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            await addTransaction({
              fiscalMonthId,
              accountId,
              categoryId: catId || null,
              date,
              description: desc,
              deposit: deposit || 0,
              withdraw: withdraw || 0,
              channel,
              note: "",
            });
            reset();
          } catch (e) {
            setError((e as Error).message);
          }
        });
      }}
      className="border-b border-hairline-soft px-5 py-3 bg-surface/50"
    >
      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end text-xs">
        <Field label="วันที่" cols="col-span-2 md:col-span-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-input border border-hairline px-2 py-1.5"
          />
        </Field>
        <Field label="รายการ" cols="col-span-2 md:col-span-3">
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            required
            placeholder="เช่น โอนซื้อของ Makro"
            className="w-full rounded-input border border-hairline px-2 py-1.5"
          />
        </Field>
        <Field label="ฝาก" cols="col-span-1 md:col-span-1">
          <input
            type="text"
            inputMode="decimal"
            value={deposit}
            onChange={(e) => {
              setDeposit(e.target.value);
              if (e.target.value) setWithdraw("");
            }}
            placeholder="0"
            className="w-full rounded-input border border-hairline px-2 py-1.5 text-right tabular-nums"
          />
        </Field>
        <Field label="ถอน" cols="col-span-1 md:col-span-1">
          <input
            type="text"
            inputMode="decimal"
            value={withdraw}
            onChange={(e) => {
              setWithdraw(e.target.value);
              if (e.target.value) setDeposit("");
            }}
            placeholder="0"
            className="w-full rounded-input border border-hairline px-2 py-1.5 text-right tabular-nums"
          />
        </Field>
        <Field label="ช่องทาง" cols="col-span-2 md:col-span-2">
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="K PLUS / EDC / ATM"
            className="w-full rounded-input border border-hairline px-2 py-1.5"
          />
        </Field>
        <Field label="หมวด" cols="col-span-2 md:col-span-2">
          <select
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
            className="w-full rounded-input border border-hairline px-2 py-1.5"
          >
            <option value="">-- ไม่ระบุ --</option>
            <optgroup label="รายรับ">
              {categories
                .filter((c) => c.kind === "INCOME")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="รายจ่าย">
              {categories
                .filter((c) => c.kind === "EXPENSE")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="โอน">
              {categories
                .filter((c) => c.kind === "TRANSFER")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </Field>
        <div className="col-span-2 md:col-span-1">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-1 rounded-input bg-ink px-3 py-2 md:py-1.5 text-canvas text-xs font-medium hover:bg-ink-2 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            {pending ? "..." : "เพิ่ม"}
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
          {error}
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  children,
  cols,
}: {
  label: string;
  children: React.ReactNode;
  cols: string;
}) {
  return (
    <div className={cols}>
      <label className="block text-[10px] text-muted mb-1 uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}
