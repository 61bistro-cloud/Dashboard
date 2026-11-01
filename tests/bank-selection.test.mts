import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

// Exercise the component's event flow with isolated hooks and a fake action.
async function setup(
  actionResult = { ok: true, deleted: 2, resetOpening: false }
) {
  const state: any[] = [];
  const calls: any[] = [];
  let cursor = 0,
    work: Promise<any> | undefined;
  const deps: Record<string, any> = {
    react: {
      useState(initial: any) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [
          state[index],
          (value: any) => {
            state[index] =
              typeof value === "function" ? value(state[index]) : value;
          },
        ];
      },
      useTransition: () => [
        false,
        (fn: any) => {
          work = fn();
        },
      ],
    },
    "react/jsx-runtime": jsxRuntime,
    "lucide-react": { Pencil: "icon", Trash2: "icon", Loader2: "icon" },
    "../actions": {
      bulkDeleteTransactions: async (input: any) => {
        calls.push(input);
        return actionResult;
      },
    },
    "@/lib/fiscal": { fmtTHB: String },
    "./tx-category-select": { TxCategorySelect: "category-select" },
    "./delete-button": { DeleteButton: "delete-button" },
  };
  const context = vm.createContext({ console });
  const code = ts.transpileModule(
    readFileSync(
      new URL(
        "../app/(app)/bank/_components/transaction-table.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  ).outputText;
  const module = new vm.SourceTextModule(code, { context });
  await module.link(async (name: string) => {
    const exports = deps[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const key of Object.keys(exports))
          this.setExport(key, exports[key]);
      },
      { context }
    );
  });
  await module.evaluate();
  const props = {
    fiscalMonthId: 20,
    accountId: 10,
    accountName: "Test account",
    monthLabel: "November",
    accountType: "BANK",
    categories: [],
    rows: [1, 2].map((id) => ({
      id,
      date: "2026-10-01T10:00:00Z",
      description: `row ${id}`,
      deposit: 100,
      withdraw: 0,
      runningBalance: 100,
      channel: "MOBILE",
      categoryId: null,
    })),
  };
  const render = () => {
    cursor = 0;
    return (module.namespace as any).TransactionTable(props);
  };
  const nodes = (node: any): any[] =>
    Array.isArray(node)
      ? node.flatMap(nodes)
      : node && typeof node === "object" && node.props
        ? [node, ...nodes(node.props.children)]
        : [];
  const text = (node: any): string =>
    Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object" && node.props
        ? text(node.props.children)
        : node == null || typeof node === "boolean"
          ? ""
          : String(node);
  const find = (predicate: (node: any) => boolean) => {
    const node = nodes(render()).find(predicate);
    assert.ok(node);
    return node;
  };
  const click = (label: string) => {
    const node = find((n) => n.type === "button" && text(n) === label);
    assert.ok(!node.props.disabled);
    node.props.onClick();
  };
  return {
    render,
    nodes,
    text,
    find,
    click,
    calls,
    done: async () => work && (await work),
  };
}

test("edit → select all → confirm sends selected IDs and current scope only on final submit", async () => {
  const h = await setup();
  assert.equal(
    h
      .nodes(h.render())
      .filter((n) => n.type === "input" && n.props.type === "checkbox").length,
    0
  );
  h.click("แก้ไข / เลือกรายการ");
  h.click("เลือกทั้งหมด");
  assert.ok(h.text(h.render()).includes("เลือก 2 / 2 รายการ"));
  h.click("ลบที่เลือก (2)");
  assert.equal(h.calls.length, 0);
  const form = h.find((n) => n.type === "form");
  assert.ok(h.text(form).includes("Test account — November"));
  h.find(
    (n) => n.type === "input" && n.props.type === "password"
  ).props.onChange({ target: { value: "test-approval" } });
  h.find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  await h.done();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), {
    fiscalMonthId: 20,
    accountId: 10,
    ids: [1, 2],
    password: "test-approval",
    resetOpening: false,
  });
  assert.ok(h.text(h.render()).includes("ลบ 2 รายการแล้ว"));
});

test("cancel performs no mutation; selecting one row offers no opening reset", async () => {
  const h = await setup();
  h.click("แก้ไข / เลือกรายการ");
  h.find((n) => n.props["aria-label"] === "เลือกรายการ row 1").props.onChange();
  assert.ok(h.text(h.render()).includes("เลือก 1 / 2 รายการ"));
  h.click("ลบที่เลือก (1)");
  assert.ok(!h.text(h.render()).includes("ล้างยอดยกมา"));
  h.click("ยกเลิก");
  assert.equal(h.calls.length, 0);
  h.click("เลือกทั้งหมด");
  h.click("ลบที่เลือก (2)");
  assert.ok(h.text(h.render()).includes("ล้างยอดยกมา"));
  const checkbox = h.find(
    (n) => n.props["aria-label"] === "เลือกทุกรายการในบัญชีและเดือนนี้"
  );
  assert.equal(checkbox.props.disabled, true);
});
