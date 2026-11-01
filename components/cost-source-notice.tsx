import Link from "next/link";
import { fmtTHB } from "@/lib/fiscal";

export function CostSourceNotice({
  source,
  pending,
  monthId,
}: {
  source: "statement" | "manual" | "mixed";
  pending: number;
  monthId?: number;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3 text-xs text-muted space-y-1">
      <p>
        ต้นทุนจาก Cost Setup:{" "}
        {source === "statement"
          ? "ใช้รายจ่ายที่จัดหมวดใน Bank & Reconcile ไม่บวกยอดกรอกเดิมซ้ำ"
          : source === "manual"
            ? "ใช้ยอดกรอกเองในเดือนที่ยังไม่มีรายการธนาคาร"
            : "ใช้รายจ่ายธนาคารในเดือนที่ลง Bank & Reconcile แล้ว และยอดกรอกเองในเดือนที่ยังไม่มีข้อมูลธนาคาร"}{" "}
        •{" "}
        <Link
          href={monthId ? `/cost-setup?month=${monthId}` : "/cost-setup"}
          className="underline"
        >
          ดูที่มาค่าใช้จ่าย
        </Link>
      </p>
      {pending > 0 && (
        <p className="text-amber-700">
          ยังมีเงินออก {fmtTHB(pending)} บาทรอจัดหมวด / ตรวจสอบ
          ซึ่งยังไม่นับในต้นทุน กำไรที่แสดงจึงยังไม่ครบ
        </p>
      )}
    </div>
  );
}
