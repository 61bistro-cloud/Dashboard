import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAdvice,
  monthTiming,
  numericInput,
} from "../lib/business-advice.ts";
import { canAccess, NAV_ITEMS } from "../lib/rbac.ts";
const base = {
  revenue: 60000,
  billCount: 300,
  fixed: 90000,
  variableRate: 0.4,
  profitGoal: 30000,
  openDays: 30,
  remainingDays: 15,
  averageBill: 200,
};
test("break-even, profit targets and remaining-day targets use contribution margin", () => {
  const r = calculateAdvice(base)!;
  assert.equal(r.breakEven, 150000);
  assert.equal(r.target, 200000);
  assert.equal(r.dailyBreakEven, 5000);
  assert.equal(r.dailyTarget, 200000 / 30);
  assert.equal(r.remainingTarget, 140000 / 15);
  assert.equal(r.remainingBreakEven, 6000);
  assert.equal(r.billsPerDay, 34);
  assert.equal(r.remainingBills, 47);
  assert.equal(r.fixedSaving, 15000);
});
test("already achieved targets never recommend negative sales or bills", () => {
  const r = calculateAdvice({ ...base, revenue: 250000 })!;
  assert.equal(r.remainingTarget, 0);
  assert.equal(r.remainingBreakEven, 0);
  assert.equal(r.remainingBills, 0);
});
test("historical months have no remaining-day forecast, without division by zero", () => {
  const r = calculateAdvice({ ...base, remainingDays: 0 })!;
  assert.equal(r.remainingTarget, null);
  assert.equal(r.remainingBills, null);
  assert.equal(r.dailyBreakEven, 5000);
});
test("no sales can be planned with an explicit rate, while missing average bill stays unknown", () => {
  const r = calculateAdvice({
    ...base,
    revenue: 0,
    billCount: 0,
    averageBill: null,
  })!;
  assert.equal(r.breakEven, 150000);
  assert.equal(r.billsPerDay, null);
  assert.equal(r.remainingBills, null);
});
test("invalid assumptions cannot produce misleading infinite or negative targets", () => {
  for (const patch of [
    { variableRate: 1 },
    { variableRate: 1.2 },
    { variableRate: -0.1 },
    { fixed: -1 },
    { profitGoal: -1 },
    { openDays: 0 },
    { openDays: 32 },
    { openDays: 2.5 },
    { remainingDays: 31 },
    { remainingDays: -1 },
    { averageBill: 0 },
    { averageBill: NaN },
    { revenue: Infinity },
    { profitGoal: NaN },
  ])
    assert.equal(calculateAdvice({ ...base, ...patch }), null);
});
test("zero variable cost and zero fixed cost remain valid mathematical cases", () => {
  assert.equal(calculateAdvice({ ...base, variableRate: 0 })!.breakEven, 90000);
  assert.equal(calculateAdvice({ ...base, fixed: 0 })!.breakEven, 0);
});
test("extreme numeric overflow is withheld", () => {
  assert.equal(
    calculateAdvice({
      ...base,
      fixed: Number.MAX_VALUE,
      variableRate: 0.9999999999999999,
    }),
    null
  );
});
test("month timing uses Bangkok midnight and handles historical/future and leap months", () => {
  const now = new Date("2026-10-31T17:01:00Z");
  assert.equal(monthTiming(2026, 11, 30, now).remainingDays, 30);
  assert.equal(monthTiming(2026, 10, 31, now).remainingDays, 0);
  assert.equal(monthTiming(2026, 12, 31, now).remainingDays, 31);
  assert.equal(
    monthTiming(2028, 2, 29, new Date("2028-02-28T17:01:00Z")).remainingDays,
    1
  );
});
test("empty, malformed and negative fields do not silently become zero", () => {
  for (const s of ["", " ", "bad", "-1", "Infinity"])
    assert.equal(numericInput(s), null);
  assert.equal(numericInput("0"), 0);
  assert.equal(numericInput("12.5"), 12.5);
});
test("advice is an owner/accountant report; staff cannot access it or nested routes", () => {
  assert.equal(canAccess("/business-advice", "OWNER"), true);
  assert.equal(canAccess("/business-advice", "ACCOUNTANT"), true);
  assert.equal(canAccess("/business-advice", "STAFF"), false);
  assert.equal(canAccess("/business-advice/x", "STAFF"), false);
  assert.ok(NAV_ITEMS.find((x) => x.href === "/business-advice"));
});
