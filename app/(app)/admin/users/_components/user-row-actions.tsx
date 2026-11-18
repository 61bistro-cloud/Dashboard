"use client";

import { useUi } from "@/lib/i18n/use-ui";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { updateUserRole, deleteUser } from "../actions";
import type { Role } from "@prisma/client";

export function RoleSelect({
  id,
  currentRole,
  isMe,
  systemAdmin = false,
}: {
  id: string;
  currentRole: Role;
  isMe: boolean;
  systemAdmin?: boolean;
}) {
  const { ui } = useUi();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(newRole: Role) {
    if (newRole === currentRole) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateUserRole({ id, role: newRole });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (systemAdmin) return <span className="text-xs">{ui("ผู้ดูแลระบบ")}</span>;
  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={currentRole}
        disabled={pending || isMe}
        onChange={(e) => onChange(e.target.value as Role)}
        className="rounded-input border border-hairline bg-canvas px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
        title={isMe ? ui("เปลี่ยนสิทธิ์ของตัวเองไม่ได้") : undefined}
      >
        <option value="OWNER">{ui("เจ้าของร้าน")}</option>
        <option value="ACCOUNTANT">{ui("บัญชี")}</option>
        <option value="STAFF">{ui("พนักงาน")}</option>
      </select>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-soft" />}
      {error && (
        <span className="text-xs text-red-600" title={ui(error)}>
          ⚠️
        </span>
      )}
    </div>
  );
}

export function DeleteUserButton({
  id,
  email,
  isMe,
  systemAdmin = false,
}: {
  id: string;
  email: string;
  isMe: boolean;
  systemAdmin?: boolean;
}) {
  const { ui } = useUi();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (isMe || systemAdmin) return;
    if (
      !confirm(
        ui(
          "ถอนสิทธิ์ผู้ใช้ {v0} หรือไม่? จะเก็บผู้ใช้และประวัติข้อมูลเดิมไว้",
          {
            v0: email,
          }
        )
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteUser(id);
      } catch (e) {
        setError((e as Error).message);
        alert(ui((e as Error).message));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending || isMe || systemAdmin}
      title={
        systemAdmin
          ? ui("สิทธิ์ผู้ดูแลระบบต้องจัดการผ่านการตั้งค่าระบบ")
          : isMe
            ? ui("ลบบัญชีตัวเองไม่ได้")
            : ui("ถอนสิทธิ์เข้าใช้")
      }
      className="inline-flex items-center justify-center rounded-pill border border-hairline px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Trash2 className="h-3 w-3" strokeWidth={1.75} />
      )}
    </button>
  );
}
