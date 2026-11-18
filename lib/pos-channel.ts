/** Platform labels take priority over how the customer paid within the app. */
export function isGrabBill(b: {
  paymentType: string | null;
  channel: string | null;
}): boolean {
  return /grab/i.test(`${b.channel ?? ""} ${b.paymentType ?? ""}`);
}
export function classifyBill(b: {
  paymentType: string | null;
  channel: string | null;
}): string | null {
  const pay = (b.paymentType ?? "").toLowerCase(),
    ch = (b.channel ?? "").toLowerCase();
  if (isGrabBill(b)) return "GRAB";
  if (/line\s*man|lineman/.test(pay + " " + ch)) return "LINEMAN";
  if (pay.includes("cash")) return "CASH";
  if (/visa|master|jcb|alipay|promptpay|qr|bank transfer/.test(pay))
    return "EDC_PROMPTPAY";
  return null;
}
