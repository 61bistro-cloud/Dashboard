import "server-only";
import { createHash } from "node:crypto";
export const transactionRemarkVersion = (note: string | null | undefined) =>
  createHash("sha256")
    .update(note ?? "")
    .digest("hex");
