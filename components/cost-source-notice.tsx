import { useUi } from "@/lib/i18n/use-ui";
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
  const { ui } = useUi();
  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3 text-xs text-muted space-y-1">
      <p>
        {ui("ต้นทุนจาก Cost Setup:")}{" "}
        {source === "statement"
          ? ui("ใช้รายจ่ายที่จัดหมวดใน Bank & Reconcile ไม่บวกยอดกรอกเดิมซ้ำ")
          : source === "manual"
            ? ui("ใช้ยอดกรอกเองในเดือนที่ยังไม่มีรายการธนาคาร")
            : ui(
                "ใช้รายจ่ายธนาคารในเดือนที่ลง Bank & Reconcile แล้ว และยอดกรอกเองในเดือนที่ยังไม่มีข้อมูลธนาคาร"
              )}{" "}
        •{" "}
        <Link
          href={monthId ? `/cost-setup?month=${monthId}` : "/cost-setup"}
          className="underline"
        >
          {ui("ดูที่มาค่าใช้จ่าย")}
        </Link>
      </p>
      {pending > 0 && (
        <p className="text-amber-700">
          {ui("ยังมีเงินออก")} {fmtTHB(pending)}{" "}
          {ui(
            "บาทรอจัดหมวด / ตรวจสอบ ซึ่งยังไม่นับในต้นทุน กำไรที่แสดงจึงยังไม่ครบ"
          )}
        </p>
      )}
    </div>
  );
}
