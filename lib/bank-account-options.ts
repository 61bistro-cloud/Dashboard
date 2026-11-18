export const ACCOUNT_OPTIONS = [
  { kind: "KBANK", name: "ธนาคารกสิกรไทย", statement: true },
  { kind: "SCB", name: "ธนาคารไทยพาณิชย์", statement: true },
  { kind: "KRUNGSRI", name: "ธนาคารกรุงศรีอยุธยา", statement: true },
  { kind: "KTB", name: "ธนาคารกรุงไทย", statement: true },
  { kind: "CASH", name: "เงินสดหน้าร้าน", statement: false },
  { kind: "GRAB", name: "Grab", statement: false },
  { kind: "LINEMAN", name: "LINE MAN", statement: false },
  { kind: "SHOPEEFOOD", name: "ShopeeFood", statement: false },
  { kind: "DELIVERY", name: "แอปเดลิเวอรีอื่นๆ", statement: false },
] as const;
export type AccountKind = (typeof ACCOUNT_OPTIONS)[number]["kind"];
export function accountKind(account: {
  code: string;
  name: string;
  accountType: string;
}): AccountKind | null {
  if (account.accountType !== "BANK") return null;
  const option = ACCOUNT_OPTIONS.find((o) =>
    new RegExp(`^${o.kind}\\d*$`).test(account.code)
  );
  if (option) return option.kind;
  // Legacy Thai account names generated the generic ACCT code. Recognize only
  // known exact bank names; do not reinterpret arbitrary names as supported banks.
  if (/^ACCT\d*$/.test(account.code)) {
    if (["กรุงศรี", "ธนาคารกรุงศรีอยุธยา"].includes(account.name))
      return "KRUNGSRI";
    if (["กรุงไทย", "ธนาคารกรุงไทย"].includes(account.name)) return "KTB";
    if (["กสิกรไทย", "ธนาคารกสิกรไทย"].includes(account.name)) return "KBANK";
    if (["ไทยพาณิชย์", "ธนาคารไทยพาณิชย์"].includes(account.name)) return "SCB";
  }
  return null;
}
export function supportsStatement(account: Parameters<typeof accountKind>[0]) {
  const kind = accountKind(account);
  return (
    kind === "KBANK" || kind === "SCB" || kind === "KRUNGSRI" || kind === "KTB"
  );
}
export function rowsMatchMonth(
  rows: { date: string }[],
  month: { calendarYear: number; calendarMonth: number; daysInMonth: number }
) {
  const prefix = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-`;
  return rows.every(
    (r) =>
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      r.date.startsWith(prefix) &&
      Number(r.date.slice(8)) >= 1 &&
      Number(r.date.slice(8)) <= month.daysInMonth
  );
}
