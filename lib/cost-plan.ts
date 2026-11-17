import { isPayrollExtraCategory } from "./flexible-costs";
import type { CostBucket } from "./statement-costs";
export const COST_GROUPS = [
  {
    id: "raw",
    section: "cogs",
    label: "ต้นทุนวัตถุดิบหลัก",
    hint: "เนื้อสัตว์ อาหารทะเล ผักผลไม้ ข้าว เส้น",
    bucket: "food",
  },
  {
    id: "condiments",
    section: "cogs",
    label: "เครื่องปรุงและของแห้ง",
    hint: "ซอส เครื่องเทศ น้ำมันพืช แป้ง วัตถุดิบผลิตเบสซอสหรือของตุ๋น",
    bucket: "food",
  },
  {
    id: "beverage",
    section: "cogs",
    label: "ต้นทุนเครื่องดื่ม",
    hint: "น้ำดื่ม น้ำอัดลม ชา กาแฟ วัตถุดิบชงเครื่องดื่ม",
    bucket: "bev",
  },
  {
    id: "packaging",
    section: "cogs",
    label: "ต้นทุนบรรจุภัณฑ์",
    hint: "กล่องอาหาร ถ้วยซุป ถุง ช้อนส้อม สติกเกอร์โลโก้",
    bucket: "pack",
  },
  {
    id: "freight",
    section: "cogs",
    label: "ค่าขนส่งวัตถุดิบเข้า",
    hint: "ค่าส่งจากผู้จำหน่าย ค่าน้ำมันไปซื้อวัตถุดิบ",
    bucket: "food",
  },
  {
    id: "labor",
    section: "opex",
    label: "ค่าใช้จ่ายเกี่ยวกับพนักงาน",
    hint: "เงินเดือน พาร์ทไทม์ ล่วงเวลา เบี้ยขยัน อินเซนทีฟ ประกันสังคม สวัสดิการและอาหารพนักงาน",
    bucket: "laborExtra",
  },
  {
    id: "selling",
    section: "opex",
    label: "ค่าใช้จ่ายในการขายและการตลาด",
    hint: "ค่าธรรมเนียมเดลิเวอรีและโฆษณา ค่าโฆษณาออนไลน์ รีวิว โปรโมชัน ค่ารูดบัตร",
    bucket: "fixed",
  },
  {
    id: "occupancy",
    section: "opex",
    label: "ค่าใช้จ่ายสถานที่และสาธารณูปโภค",
    hint: "ค่าเช่า ค่าน้ำ ค่าไฟ ค่าแก๊ส อินเทอร์เน็ต โทรศัพท์ • แยกค่าแก๊สเป็นรายการต่างหากได้",
    bucket: "fixed",
  },
  {
    id: "admin",
    section: "opex",
    label: "ค่าใช้จ่ายบริหารและเบ็ดเตล็ด",
    hint: "ค่าระบบขายและซอฟต์แวร์ วัสดุสิ้นเปลือง ซ่อมบำรุง ค่าเสื่อมราคา",
    bucket: "fixed",
  },
] as const;
export type CostGroup = (typeof COST_GROUPS)[number]["id"];
export type CostPlanItem = {
  id?: number;
  source: "supplier" | "category";
  name: string;
  amount: number;
  group: CostGroup;
};
export const GROUP_MARKER = "cost-setup:group:";
export const SUPPLIER_GROUP_MARKER = "cost-setup:supplier-group:";
export const isCostGroup = (value: string): value is CostGroup =>
  COST_GROUPS.some((g) => g.id === value);
export const groupBucket = (group: CostGroup): CostBucket =>
  COST_GROUPS.find((g) => g.id === group)!.bucket;
export function explicitGroup(icon?: string | null): CostGroup | null {
  const value = icon?.startsWith(GROUP_MARKER)
    ? icon.slice(GROUP_MARKER.length)
    : "";
  return isCostGroup(value) ? value : null;
}
export function supplierGroups(categories: { icon?: string | null }[]) {
  const result = new Map<number, CostGroup>();
  for (const category of categories) {
    if (!category.icon?.startsWith(SUPPLIER_GROUP_MARKER)) continue;
    const [id, group] = category.icon
      .slice(SUPPLIER_GROUP_MARKER.length)
      .split(":");
    if (/^\d+$/.test(id) && isCostGroup(group)) result.set(Number(id), group);
  }
  return result;
}
export function supplierGroup(
  supplier: { id: number; category: string },
  overrides: Map<number, CostGroup>
): CostGroup {
  return (
    overrides.get(supplier.id) ??
    (supplier.category === "BEVERAGE"
      ? "beverage"
      : supplier.category === "PACKAGING"
        ? "packaging"
        : "raw")
  );
}
export function categoryGroup(category: {
  name?: string;
  icon?: string | null;
}): CostGroup {
  const explicit = explicitGroup(category.icon);
  if (explicit) return explicit;
  if (isPayrollExtraCategory(category.icon)) return "labor";
  const name = category.name ?? "";
  if (
    /เงินเดือน|ค่าจ้าง|ค่าแรง|ประกันสังคม|สวัสดิการ|อาหารพนักงาน|social security|staff.*meal/i.test(
      name
    )
  )
    return "labor";
  if (
    /โฆษณา|การตลาด|โปรโมชั่น|โปรโมชัน|marketing|facebook|tiktok|influencer|\bgp\b|platform|แพลตฟอร์ม|ค่ารูดบัตร/i.test(
      name
    )
  )
    return "selling";
  if (
    /เช่า|ค่าน้ำ(?!มัน|ยา)|ค่าไฟ|ไฟฟ้า|แก๊ส|อินเทอร์เน็ต|อินเตอร์เน็ต|โทรศัพท์|rent|electric|utilities|internet|telephone|\bgas\b/i.test(
      name
    )
  )
    return "occupancy";
  return "admin";
}
export const categoryBucket = (category: Parameters<typeof categoryGroup>[0]) =>
  groupBucket(categoryGroup(category));
export function costPlanRows(
  suppliers: { id: number; name: string; category: string; active: boolean }[],
  purchases: {
    supplierId: number;
    amount: number;
    nameOverride: string | null;
  }[],
  categories: {
    id: number;
    name: string;
    icon: string | null;
    active: boolean;
  }[],
  costs: { categoryId: number; amount: number }[]
): CostPlanItem[] {
  const overrides = supplierGroups(categories),
    purchaseMap = new Map(purchases.map((p) => [p.supplierId, p])),
    costMap = new Map(costs.map((c) => [c.categoryId, c.amount]));
  return [
    ...suppliers
      .filter((s) => s.active || (purchaseMap.get(s.id)?.amount ?? 0) !== 0)
      .map((s) => ({
        id: s.id,
        source: "supplier" as const,
        name: purchaseMap.get(s.id)?.nameOverride ?? s.name,
        amount: purchaseMap.get(s.id)?.amount ?? 0,
        group: supplierGroup(s, overrides),
      })),
    ...categories
      .filter(
        (c) =>
          !isPayrollExtraCategory(c.icon) &&
          !c.icon?.startsWith(SUPPLIER_GROUP_MARKER) &&
          (c.active || (costMap.get(c.id) ?? 0) !== 0)
      )
      .map((c) => ({
        id: c.id,
        source: "category" as const,
        name: c.name,
        amount: costMap.get(c.id) ?? 0,
        group: categoryGroup(c),
      })),
  ];
}
