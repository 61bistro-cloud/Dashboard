import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as jsx from "react/jsx-runtime";
export async function loadModules(
  entry: string,
  deps: Record<string, any>,
  globals: Record<string, any> = {}
) {
  const context = vm.createContext({
    console,
    Buffer,
    URL,
    Request,
    Response,
    File,
    FormData,
    Date,
    TextDecoder,
    TextEncoder,
    process: { env: {} },
    ...globals,
  });
  const cache = new Map<string, vm.Module>();
  async function load(name: string): Promise<vm.Module> {
    if (cache.has(name)) return cache.get(name)!;
    const exports =
      name === "react/jsx-runtime"
        ? jsx
        : name === "server-only"
          ? {}
          : deps[name];
    if (exports) {
      const m = new vm.SyntheticModule(
        Object.keys(exports),
        function () {
          for (const k of Object.keys(exports)) this.setExport(k, exports[k]);
        },
        { context }
      );
      cache.set(name, m);
      return m;
    }
    let file: string;
    if (name.startsWith("@/"))
      file = resolve(import.meta.dirname, "../..", name.slice(2));
    else if (name === entry) file = resolve(import.meta.dirname, "../..", name);
    else throw Error("Missing dependency " + name);
    if (!/\.[cm]?[jt]sx?$/.test(file)) {
      try {
        readFileSync(file + ".ts");
        file += ".ts";
      } catch {
        file += ".tsx";
      }
    }
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const m = new vm.SourceTextModule(code, { context });
    cache.set(name, m);
    await m.link(load);
    return m;
  }
  const m = await load(entry);
  await m.evaluate();
  return m.namespace as any;
}
