import { spawnSync } from "node:child_process";
import { assertLocalDatabaseTool } from "../lib/database-safety";
assertLocalDatabaseTool();
const command = process.argv[2];
if (command !== "push") throw Error("Only local push is supported");
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "db", "push"],
  { stdio: "inherit", env: process.env }
);
process.exit(result.status ?? 1);
