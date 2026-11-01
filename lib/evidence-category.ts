/** Read only explicit memo fields, not bank logos or the entire OCR body. */
export function extractEvidenceRemark(text: string): string | null {
  const lines = text.replace(/\r/g, "").split("\n");
  const label =
    /^\s*(?:remarks?|memo|note|หมาย\s*เหตุ|บันทึกช่วยจำ|บันทึกเพิ่มเติม|บันทึก|ข้อความถึงผู้รับ(?:โอน)?|รายละเอียดการโอน)(?:\s*[:：]\s*|[ \t]+|$)(.*)$/i;
  const boundary =
    /^(?:remarks?\b|note\b|memo\b|from\b|to\b|reference\b|transaction\b|amount\b|total\b|ผู้โอน|ผู้รับ|บัญชี|เลข(?:ที่|อ้างอิง|บัญชี)|รหัส|วันที่|เวลา|จำนวนเงิน|ยอดเงิน|ค่าธรรมเนียม|ธนาคาร|ขอบคุณ|โปรด|กรุณา|บันทึกสลิป|บันทึกรูป|สแกน|scan\b|save slip)/i;
  for (let i = 0; i < lines.length; i++) {
    const found = lines[i].match(label);
    if (!found) continue;
    const parts = found[1].trim() ? [found[1].trim()] : [];
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const next = lines[j].trim();
      if (!next) {
        if (parts.length) break;
        continue;
      }
      if (boundary.test(next) || /^\d[\d,.:/\s-]*(?:บาท|THB)?$/.test(next))
        break;
      parts.push(next);
    }
    const remark = parts.join(" ").replace(/\s+/g, " ").trim();
    if (
      !remark ||
      /^(?:[-—–]+|ไม่มี(?:ข้อความ|หมายเหตุ)?|none|n\/?a|no remarks?)$/i.test(
        remark
      )
    )
      continue;
    if (
      /^(?:please\b|this\b|โปรด|กรุณา|รายการนี้|เอกสารนี้|ใช้เป็นหลักฐาน)/i.test(
        remark
      )
    )
      continue;
    return remark.slice(0, 1000);
  }
  return null;
}

export type EvidenceCategory = { id: number; name: string; kind: string };
export type CategorySuggestion = {
  categoryId: number;
  name: string;
  reason: string;
};
type Rule = {
  keyword: RegExp;
  exact: string;
  category: RegExp;
  direction: "in" | "out" | "both";
  kinds: string[];
  exclusive?: boolean;
};
const rules: Rule[] = [
  {
    keyword:
      /โอนระหว่างบัญชี|ย้ายเงิน|โอน.*บัญชีตัวเอง|โอน.*บัญชีร้าน(?:ตัวเอง|ของเรา)/i,
    exact: "🔄 โอนระหว่างบัญชี",
    category: /โอนระหว่างบัญชี|transfer/i,
    direction: "both",
    kinds: ["TRANSFER"],
    exclusive: true,
  },
  {
    keyword:
      /เพิ่มเงินบริหาร|เติมเงิน(?:เข้า)?ร้าน|เพิ่มทุน|เงินทุน|owner.?s? capital/i,
    exact: "💰 รายรับ - เพิ่มเงินบริหาร",
    category: /เพิ่มเงินบริหาร|เพิ่มทุน|เงินทุน/i,
    direction: "in",
    kinds: ["INCOME"],
    exclusive: true,
  },
  {
    keyword:
      /เบิกเงินเจ้าของ|ถอนกำไร|เบิกผู้บริหาร|โอนให้เจ้าของ|โอนให้ผู้บริหาร/i,
    exact: "👔 เบิกเงิน/โอนให้ผู้บริหาร",
    category: /ผู้บริหาร|เจ้าของ|owner.?s? draw/i,
    direction: "out",
    kinds: ["EXPENSE", "TRANSFER"],
    exclusive: true,
  },
  {
    keyword: /เบิกล่วงหน้า|เงินล่วงหน้า|ทดรอง.*พนักงาน/i,
    exact: "💊 เบิกล่วงหน้าพนักงาน",
    category: /เบิกล่วงหน้า|เงินล่วงหน้า/i,
    direction: "out",
    kinds: ["EXPENSE", "TRANSFER"],
    exclusive: true,
  },
  {
    keyword: /ชำระ.*บัตรเครดิต|จ่าย.*บัตรเครดิต|credit.?card.*payment/i,
    exact: "🔴 ชำระบัตรเครดิต",
    category: /ชำระ.*บัตร|credit.?card.*payment/i,
    direction: "out",
    kinds: ["EXPENSE", "TRANSFER"],
    exclusive: true,
  },
  {
    keyword: /เงินเดือน|salary|payroll/i,
    exact: "👥 เงินเดือนพนักงาน",
    category: /เงินเดือน|salary/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword: /ค่าจ้าง|ค่าแรง|\bot\b|โอที|โบนัส/i,
    exact: "👥 ค่าจ้าง/OT/พิเศษ",
    category: /ค่าจ้าง|ค่าแรง|\bot\b|พิเศษ/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword:
      /ค่าไฟ|ค่าน้ำประปา|ค่าน้ำ(?=\s|เดือน|ประจำ|$|[0-9])|ไฟฟ้า|ประปา|electricity|water bill/i,
    exact: "⚡ ค่าสาธารณูปโภค (ไฟ/น้ำ)",
    category: /สาธารณูปโภค|ค่าไฟ|ค่าน้ำ|utilities/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword: /ค่าเช่า|rent/i,
    exact: "🏠 ค่าเช่า",
    category: /ค่าเช่า|rent/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword: /อินเทอร์เน็ต|อินเตอร์เน็ต|ค่าเน็ต|โทรศัพท์|internet|wifi|3bb/i,
    exact: "🌐 ค่าอินเตอร์เน็ต/โทรศัพท์",
    category: /อินเตอร์เน็ต|อินเทอร์เน็ต|โทรศัพท์|internet/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword:
      /subscription|software|canva|netflix|spotify|ค่าโปรแกรม|ค่าซอฟต์แวร์/i,
    exact: "📱 Subscription & Software",
    category: /subscription|software|ซอฟต์แวร์|โปรแกรม/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword: /ค่าโฆษณา|โฆษณา|marketing|ads\b/i,
    exact: "📣 Marketing & โฆษณา",
    category: /marketing|โฆษณา/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword:
      /เครื่องดื่ม|น้ำดื่ม|น้ำแข็ง|เบียร์|กาแฟ|ใบชา|ชานม|ชาเขียว|beverage|coffee/i,
    exact: "🍹 ต้นทุน - วัตถุดิบเครื่องดื่ม",
    category: /เครื่องดื่ม|beverage/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword:
      /กล่อง|ถุง|แก้ว|ฝา(?:แก้ว|กล่อง)|หลอด|แพ็ค|แพ็ก|บรรจุภัณฑ์|packaging/i,
    exact: "📦 ต้นทุน - แพ็คเกจจิ้ง",
    category: /แพ็ค|แพ็ก|บรรจุภัณฑ์|packaging/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
  {
    keyword:
      /วัตถุดิบ|ค่าผัก|ซื้อผัก|ค่าหมู|ซื้อหมู|ค่าไก่|ซื้อไก่|ค่าเนื้อ|ค่าปลา|ค่ากุ้ง|ค่าไข่|ค่าข้าว|ซื้อของเข้าครัว|freshket|makro|แม็คโคร/i,
    exact: "🥩 ต้นทุน - วัตถุดิบอาหาร",
    category: /วัตถุดิบอาหาร|ต้นทุนอาหาร|จัดซื้อ|food/i,
    direction: "out",
    kinds: ["EXPENSE"],
  },
];
export function suggestRemarkCategories(
  remark: string,
  tx: { deposit: number; withdraw: number } | null,
  categories: EvidenceCategory[]
): CategorySuggestion[] {
  if (!remark.trim() || !tx) return [];
  const results = new Map<number, CategorySuggestion>();
  for (const rule of rules) {
    if (
      (rule.direction === "in" && !(tx.deposit > 0)) ||
      (rule.direction === "out" && !(tx.withdraw > 0))
    )
      continue;
    const keyword = remark.match(rule.keyword)?.[0];
    if (!keyword) continue;
    const allowed = categories.filter((category) =>
      rule.kinds.includes(category.kind)
    );
    const exact = allowed.find((category) => category.name === rule.exact);
    const matches = exact
      ? [exact]
      : allowed.filter((category) => rule.category.test(category.name));
    for (const category of matches) {
      if (!results.has(category.id))
        results.set(category.id, {
          categoryId: category.id,
          name: category.name,
          reason: `Remark มีคำว่า “${keyword}”`,
        });
    }
    if (rule.exclusive && matches.length) break;
  }
  return Array.from(results.values());
}
const notePrefix = (fileId: number) => `หลักฐาน #${fileId} · Remark: `;
export function getConfirmedRemark(
  note: string | null | undefined,
  fileId: number
): string | null {
  return (
    note
      ?.split("\n")
      .find((line) => line.startsWith(notePrefix(fileId)))
      ?.slice(notePrefix(fileId).length) ?? null
  );
}
export function mergeConfirmedRemark(
  note: string | null,
  fileId: number,
  remark: string
): string | null {
  const retained = (note ?? "")
    .split("\n")
    .filter((line) => !line.startsWith(notePrefix(fileId)))
    .join("\n")
    .replace(/\n+$/, "");
  const normalized = remark.replace(/\s+/g, " ").trim();
  return (
    [retained, normalized ? notePrefix(fileId) + normalized : ""]
      .filter(Boolean)
      .join("\n") || null
  );
}
