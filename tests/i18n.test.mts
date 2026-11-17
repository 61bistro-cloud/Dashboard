import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUi,
  displayMonth,
  supportedLocale,
  dateLocale,
} from "../lib/i18n/core";
import messages from "../lib/i18n/messages.json";

test("language selection has a safe Thai default and independent translators", () => {
  assert.equal(supportedLocale(), "th");
  assert.equal(supportedLocale("unsupported"), "th");
  const th = createUi("th"),
    en = createUi("en");
  assert.equal(en("Dashboard"), "Dashboard");
  assert.equal(th("Dashboard"), "ภาพรวม");
  assert.equal(en("ภาพรวมและรายงาน"), "Overview & reports");
  assert.equal(th("Bank & Reconcile"), "บัญชีและกระทบยอด");
  assert.equal(en("บันทึก"), "Save");
  assert.equal(th("บันทึก"), "บันทึก");
  assert.equal(th(en("บันทึก")), "บันทึก");
  assert.equal(
    th("Saved 149 transactions — skipped 2 duplicates"),
    "บันทึก 149 รายการ — ข้ามรายการซ้ำ 2 รายการ"
  );
});
test("interface messages interpolate amounts and names without modifying their values", () => {
  const en = createUi("en");
  assert.equal(en("{v0} บิล", { v0: 149 }), "149 bills");
  assert.equal(en("ลบ {v0}", { v0: "ร้านทดสอบ" }), "Delete ร้านทดสอบ");
  assert.equal(
    en("บันทึก 149 รายการ — ข้ามรายการซ้ำ 2 รายการ"),
    "Saved 149 transactions — skipped 2 duplicates"
  );
  assert.equal(en("รายการส่วนตัว ABC 2,000.00"), "รายการส่วนตัว ABC 2,000.00");
});
test("calendar labels change at presentation only and support all fiscal months", () => {
  assert.equal(displayMonth("ตุลาคม 2569", "en"), "October 2026");
  assert.equal(displayMonth("ต.ค. 2569", "en"), "Oct 2026");
  assert.equal(displayMonth("มกราคม 2570", "en"), "January 2027");
  assert.equal(displayMonth("ตุลาคม 2569", "th"), "ตุลาคม 2569");
  assert.equal(dateLocale("en"), "en-GB");
});
test("every catalogued interface entry has an English translation and preserves template parameters", () => {
  for (const [source, translations] of Object.entries(messages)) {
    assert.ok(translations.en, source);
    assert.ok(!/[ก-๙]/.test(translations.en), source);
    const keys = (s: string) => (s.match(/\{v\d+\}/g) ?? []).sort();
    assert.deepEqual(keys(translations.en), keys(source), source);
    if ("th" in translations)
      assert.deepEqual(keys(translations.th), keys(source), source);
  }
});
