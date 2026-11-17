import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { costPlanRows } from "./cost-plan";
import { payrollExtraRows } from "./flexible-costs";

export async function getManualCostData(
  businessId: number,
  fiscalMonthId: number,
  db: Prisma.TransactionClient = prisma
) {
  const where = { businessId, fiscalMonthId };
  const [employees, payroll, extras, suppliers, purchases, categories, costs] =
    await Promise.all([
      db.employee.findMany({
        where: { businessId },
        orderBy: { sortOrder: "asc" },
      }),
      db.employeePayroll.findMany({ where }),
      db.payrollExtra.findMany({ where }),
      db.supplier.findMany({
        where: { businessId },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      }),
      db.supplierPurchase.findMany({ where }),
      db.fixedCostCategory.findMany({
        where: { businessId },
        orderBy: { id: "asc" },
      }),
      db.fixedCost.findMany({ where }),
    ]);
  const items = costPlanRows(suppliers, purchases, categories, costs);
  const revision = createHash("sha256")
    .update(JSON.stringify({ businessId, fiscalMonthId, items }))
    .digest("hex");
  const payrollExtras = payrollExtraRows(categories, costs, extras);
  return {
    employees,
    payroll,
    payrollExtras,
    suppliers,
    purchases,
    categories,
    costs,
    items,
    revision,
    laborBase: payroll.reduce((sum, p) => sum + p.amount, 0),
    legacyLaborExtra: payrollExtras.reduce((sum, e) => sum + e.amount, 0),
  };
}
