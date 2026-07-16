"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  addReconItem,
  updateReconItem,
  deleteReconItem,
  moveReconItem,
} from "../actions";

type Item = {
  id: number;
  name: string;
  matchField: string | null;
  matchKeywords: string | null;
};

const FIELDS = [
  { v: "NONE", label: "ไม่ดึงจาก POS (กรอกเข้าจริงอย่างเดียว)" },
  { v: "PAYMENT", label: "ประเภทการชำระ" },
  { v: "TABLE", label: "โต๊ะ" },
  { v: "CHANNEL", label: "ช่องทาง" },
];

export function ReconItemManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // add form
  const [name, setName] = useState("");
  const [field, setField] = useState("PAYMENT");
  const [kw, setKw] = useState("");

  function run(fn: () => Promise<{ ok: boolean; message?: string } | void>) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r && r.ok === false) setErr(r.message ?? "ผิดพลาด");
      else router.refresh();
    });
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="text-sm font-semibold">ตั้งค่ารายการกระทบยอด</h2>
        <p className="text-xs text-muted mt-0.5">
          ลำดับ = ลำดับการตรวจ (บิลจะถูกจับเข้ารายการแรกที่ตรงกฎ) — เช่น
          Grab/Wokboy ต้องอยู่<strong>เหนือ</strong> “โอนเข้าบัญชี”
          ไม่งั้นจะโดนนับรวมกัน
        </p>
      </header>

      <ul className="divide-y divide-hairline-soft">
        {items.map((it, i) => (
          <li key={it.id} className="px-5 py-2.5">
            {editing === it.id ? (
              <EditRow
                item={it}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(d) =>
                  run(async () => {
                    const r = await updateReconItem({ id: it.id, ...d });
                    if (r.ok) setEditing(null);
                    return r;
                  })
                }
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => run(() => moveReconItem(it.id, "up"))}
                    disabled={pending || i === 0}
                    className="text-muted-soft hover:text-ink disabled:opacity-30"
                    aria-label="เลื่อนขึ้น"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => moveReconItem(it.id, "down"))}
                    disabled={pending || i === items.length - 1}
                    className="text-muted-soft hover:text-ink disabled:opacity-30"
                    aria-label="เลื่อนลง"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="w-5 text-xs text-muted-soft tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{it.name}</span>
                <span className="text-xs text-muted">
                  {it.matchField
                    ? `${FIELDS.find((f) => f.v === it.matchField)?.label} มี: ${it.matchKeywords}`
                    : "กรอกเอง"}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(it.id)}
                  className="text-muted-soft hover:text-ink"
                  aria-label="แก้ไข"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => run(() => deleteReconItem(it.id))}
                  disabled={pending}
                  className="text-red-600 hover:text-red-700 disabled:opacity-50"
                  aria-label="ลบ"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Add */}
      <div className="border-t border-hairline-soft bg-surface/50 px-5 py-3 flex flex-wrap items-end gap-2">
        <label className="text-xs flex-1 min-w-[140px]">
          <span className="block text-muted mb-0.5">ชื่อรายการใหม่</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Shopee Food"
            className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted mb-0.5">ดึงจาก POS โดยดู</span>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="rounded border border-hairline-soft bg-canvas px-2 py-1"
          >
            {FIELDS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {field !== "NONE" && (
          <label className="text-xs flex-1 min-w-[140px]">
            <span className="block text-muted mb-0.5">
              คำที่ต้องมี (คั่นด้วย ,)
            </span>
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="เช่น shopee,shopeefood"
              className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const r = await addReconItem({
                name,
                matchField: field as "PAYMENT" | "TABLE" | "CHANNEL" | "NONE",
                matchKeywords: kw,
              });
              if (r.ok) {
                setName("");
                setKw("");
              }
              return r;
            })
          }
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          เพิ่มรายการ
        </button>
      </div>

      {err && <p className="px-5 pb-3 text-xs text-red-600">{err}</p>}
    </section>
  );
}

function EditRow({
  item,
  pending,
  onCancel,
  onSave,
}: {
  item: Item;
  pending: boolean;
  onCancel: () => void;
  onSave: (d: {
    name: string;
    matchField: "PAYMENT" | "TABLE" | "CHANNEL" | "NONE";
    matchKeywords: string;
  }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [field, setField] = useState(item.matchField ?? "NONE");
  const [kw, setKw] = useState(item.matchKeywords ?? "");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[120px] rounded border border-hairline-soft bg-canvas px-2 py-1 text-sm"
      />
      <select
        value={field}
        onChange={(e) => setField(e.target.value)}
        className="rounded border border-hairline-soft bg-canvas px-2 py-1 text-xs"
      >
        {FIELDS.map((f) => (
          <option key={f.v} value={f.v}>
            {f.label}
          </option>
        ))}
      </select>
      {field !== "NONE" && (
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="คำที่ต้องมี, คั่นด้วย ,"
          className="flex-1 min-w-[120px] rounded border border-hairline-soft bg-canvas px-2 py-1 text-xs"
        />
      )}
      <button
        type="button"
        onClick={() =>
          onSave({
            name,
            matchField: field as "PAYMENT" | "TABLE" | "CHANNEL" | "NONE",
            matchKeywords: kw,
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-pill bg-ink px-3 py-1 text-xs text-canvas disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> บันทึก
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 rounded-pill border border-hairline px-3 py-1 text-xs"
      >
        <X className="h-3.5 w-3.5" /> ยกเลิก
      </button>
    </div>
  );
}
