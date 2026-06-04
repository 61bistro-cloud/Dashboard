import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";

type SearchParams = Promise<{ from?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "บัญชี Google นี้ยังไม่ได้รับสิทธิ์เข้าระบบ — ติดต่อเจ้าของร้านเพื่อขอเพิ่มสิทธิ์",
  OAuthSignin: "เกิดข้อผิดพลาดระหว่างเชื่อมต่อ Google — ลองอีกครั้ง",
  OAuthCallback: "เกิดข้อผิดพลาดระหว่างเชื่อมต่อ Google — ลองอีกครั้ง",
  Configuration: "ระบบ Google Login ยังไม่ได้ตั้งค่า — ติดต่อ admin",
};

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
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: from || "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-pill border border-hairline bg-canvas px-5 py-3 text-[15px] font-medium text-ink hover:bg-surface transition-colors"
          >
            <GoogleLogo />
            เข้าสู่ระบบด้วย Google
          </button>
        </form>

        {error && (
          <div className="mt-5 rounded-input bg-pink px-3.5 py-2.5 text-sm text-black">
            {ERROR_MESSAGES[error] ?? "เกิดข้อผิดพลาด — ลองอีกครั้ง"}
          </div>
        )}

        <div className="mt-10 rounded-card bg-surface p-5 text-xs text-muted">
          <div className="font-medium mb-2 text-ink uppercase tracking-wide">
            สิทธิ์เข้าถึง
          </div>
          <p>
            เฉพาะ Gmail ที่อยู่ในรายชื่อที่ได้รับอนุญาตเท่านั้นที่เข้าระบบได้
            <br />
            ผู้ใช้ใหม่ติดต่อเจ้าของร้านเพื่อเพิ่มสิทธิ์
          </p>
        </div>
      </div>
    </div>
  );
}

/** Inline Google "G" logo — official brand colors. */
function GoogleLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
