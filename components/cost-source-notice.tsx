import { useUi } from "@/lib/i18n/use-ui";
import Link from "next/link";

export function CostSourceNotice({
  revenue,
  costTotal,
  monthId,
}: {
  source: "statement" | "manual" | "mixed";
  pending: number;
  monthId?: number;
  revenue?: number;
  costTotal?: number;
}) {
  const { ui } = useUi();
  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3 text-xs text-muted space-y-1">
      <p>
        {ui("ต้นทุนจาก Cost Setup:")}{" "}
        {ui(
          "ใช้ต้นทุนที่เจ้าของกรอกเองทุกเดือน • รายได้จากยอดขายหน้าร้าน • Statement ใช้ตรวจเทียบการจ่ายเท่านั้น"
        )}{" "}
        •{" "}
        <Link
          href={monthId ? `/cost-setup?month=${monthId}` : "/cost-setup"}
          className="underline"
        >
          {ui("ดูที่มาค่าใช้จ่าย")}
        </Link>
      </p>
      {revenue != null && revenue > 0 && costTotal === 0 && (
        <p role="alert" className="text-amber-700">
          {ui(
            "ยังไม่ได้กรอกต้นทุน กำไรที่แสดงยังไม่รวมค่าใช้จ่าย กรุณากรอกให้ครบก่อนใช้งบ"
          )}
        </p>
      )}
    </div>
  );
}
