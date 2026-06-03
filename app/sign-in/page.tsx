import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { UtensilsCrossed } from "lucide-react";

type SearchParams = Promise<{ from?: string; error?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { from, error } = await searchParams;

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-canvas">
            <UtensilsCrossed className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h1 className="mt-5 text-[28px] font-semibold tracking-tight">
            61 Bistro
          </h1>
          <p className="mt-1 text-[15px] text-muted">ระบบบัญชี 2569</p>
        </div>

        <form
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: from || "/",
              });
            } catch (err) {
              if (err instanceof AuthError) {
                redirect(
                  `/sign-in?error=invalid${from ? `&from=${from}` : ""}`
                );
              }
              throw err;
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wide">
              อีเมล
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-input border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] focus:border-ink focus:outline-none transition-colors"
              placeholder="you@61bistro.local"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wide">
              รหัสผ่าน
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-input border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] focus:border-ink focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-input bg-pink px-3.5 py-2.5 text-sm text-black">
              อีเมลหรือรหัสผ่านไม่ถูกต้อง
            </div>
          )}

          <button
            type="submit"
            className="mt-2 w-full rounded-pill bg-ink px-5 py-3 text-[15px] font-medium text-canvas hover:bg-ink-2 transition-colors"
          >
            เข้าสู่ระบบ
          </button>
        </form>

        <div className="mt-10 rounded-card bg-surface p-5 text-xs text-muted">
          <div className="font-medium mb-2 text-ink uppercase tracking-wide">
            บัญชีทดสอบ (dev only)
          </div>
          <ul className="space-y-1 font-mono text-ink">
            <li>owner@61bistro.local / owner1234</li>
            <li>accountant@61bistro.local / acct1234</li>
            <li>staff@61bistro.local / staff1234</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
