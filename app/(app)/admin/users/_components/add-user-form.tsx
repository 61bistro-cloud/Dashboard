"use client";

import { useUi } from "@/lib/i18n/use-ui";

import { useState, useTransition } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { addUser } from "../actions";

export function AddUserForm({
  businesses,
}: {
  businesses: { id: number; name: string }[];
}) {
  const { ui } = useUi();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setOk(null);
    startTransition(async () => {
      try {
        await addUser({
          email: String(formData.get("email") ?? ""),
          name: String(formData.get("name") ?? ""),
          role: formData.get("role") as "OWNER" | "ACCOUNTANT" | "STAFF",
          businessIds: [Number(formData.get("businessId"))],
        });
        setOk(
          ui("เพิ่มผู้ใช้เรียบร้อย — ผู้ใช้สามารถ login ด้วย Google ได้ทันที")
        );
        // Reset form
        const form = document.getElementById(
          "add-user-form"
        ) as HTMLFormElement | null;
        form?.reset();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form
      id="add-user-form"
      action={onSubmit}
      className="rounded-card border border-hairline bg-canvas p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold">{ui("เพิ่มผู้ใช้ใหม่")}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5">
          <label className="block text-xs text-muted mb-1">
            {ui("อีเมล Google")} <span className="text-red-600">*</span>
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="someone@gmail.com"
            className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs text-muted mb-1">
            {ui("ชื่อแสดงผล (ไม่บังคับ)")}
          </label>
          <input
            name="name"
            type="text"
            placeholder={ui("เช่น คุณบีม")}
            maxLength={80}
            className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-muted mb-1">
            {ui("สิทธิ์")} <span className="text-red-600">*</span>
          </label>
          <select
            name="role"
            required
            defaultValue="STAFF"
            className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm"
          >
            <option value="OWNER">{ui("เจ้าของร้าน")}</option>
            <option value="ACCOUNTANT">{ui("บัญชี")}</option>
            <option value="STAFF">{ui("พนักงาน")}</option>
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}{" "}
            {ui("เพิ่มผู้ใช้")}
          </button>
        </div>
      </div>

      <label className="mt-3 block text-xs text-muted">
        {ui("เลือกธุรกิจให้ผู้ใช้")}
        <select
          name="businessId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-input border border-hairline bg-canvas p-2 text-sm"
        >
          <option value="">{ui("— เลือกธุรกิจ —")}</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <div className="mt-3 rounded-input bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {ui(error)}
        </div>
      )}
      {ok && (
        <div className="mt-3 rounded-input bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          {ok}
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        {ui(
          "ผู้ใช้ต้องใช้อีเมลที่ผูกกับบัญชี Google และจะเข้าถึงเฉพาะธุรกิจที่เลือก"
        )}
      </p>
    </form>
  );
}
