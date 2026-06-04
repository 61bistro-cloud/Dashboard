"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { updateUserRole, deleteUser } from "../actions";
import type { Role } from "@prisma/client";

export function RoleSelect({
  id,
  currentRole,
  isMe,
}: {
  id: string;
  currentRole: Role;
  isMe: boolean;
}) {
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

  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={currentRole}
        disabled={pending || isMe}
        onChange={(e) => onChange(e.target.value as Role)}
        className="rounded-input border border-hairline bg-canvas px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
        title={isMe ? "เปลี่ยนสิทธิ์ของตัวเองไม่ได้" : undefined}
      >
        <option value="OWNER">เจ้าของร้าน</option>
        <option value="ACCOUNTANT">บัญชี</option>
        <option value="STAFF">พนักงาน</option>
      </select>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-soft" />}
      {error && (
        <span className="text-xs text-red-600" title={error}>
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
}: {
  id: string;
  email: string;
  isMe: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (isMe) return;
    if (
      !confirm(
        `ลบผู้ใช้ ${email} จริงหรือไม่? ผู้ใช้คนนี้จะไม่สามารถ login ได้อีก`
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
        alert((e as Error).message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending || isMe}
      title={isMe ? "ลบบัญชีตัวเองไม่ได้" : "ลบผู้ใช้"}
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
