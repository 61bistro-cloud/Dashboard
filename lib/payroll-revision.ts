import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isPayrollExtraCategory } from "./flexible-costs";
type Row = Record<string, any>;
export function payrollRevision(
  businessId: number,
  fiscalMonthId: number,
  data: {
    employees: Row[];
    payroll: Row[];
    extras: Row[];
    categories: Row[];
    costs: Row[];
  }
) {
  const select = (rows: Row[], keys: string[]) =>
    rows
      .map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const cats = data.categories.filter((c) => isPayrollExtraCategory(c.icon));
  const ids = new Set(cats.map((c) => c.id));
  return createHash("sha256")
    .update(
      JSON.stringify({
        businessId,
        fiscalMonthId,
        employees: select(data.employees, [
          "id",
          "name",
          "shortName",
          "active",
          "sortOrder",
        ]),
        payroll: select(data.payroll, ["employeeId", "amount", "nameOverride"]),
        extras: select(data.extras, ["type", "amount"]),
        categories: select(cats, ["id", "name", "icon", "active", "sortOrder"]),
        costs: select(
          data.costs.filter((c) => ids.has(c.categoryId)),
          ["categoryId", "amount"]
        ),
      })
    )
    .digest("hex");
}
export async function readPayrollRevision(
  tx: Prisma.TransactionClient,
  businessId: number,
  fiscalMonthId: number
) {
  const where = { businessId, fiscalMonthId };
  const [employees, payroll, extras, categories, costs] = await Promise.all([
    tx.employee.findMany({ where: { businessId } }),
    tx.employeePayroll.findMany({ where }),
    tx.payrollExtra.findMany({ where }),
    tx.fixedCostCategory.findMany({ where: { businessId } }),
    tx.fixedCost.findMany({ where }),
  ]);
  return payrollRevision(businessId, fiscalMonthId, {
    employees,
    payroll,
    extras,
    categories,
    costs,
  });
}
