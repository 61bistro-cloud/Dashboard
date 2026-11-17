"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLanguage } from "@/app/language-actions";
import { useUi } from "@/lib/i18n/use-ui";

export function LanguageSwitcher() {
  const { uiLocale } = useUi();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const english = uiLocale === "en";
  return (
    <section
      aria-label={english ? "Switch language" : "เปลี่ยนภาษา"}
      className="pb-2"
    >
      <h2 className="border-y border-hairline-soft bg-surface px-5 py-2 text-[11px] font-medium leading-5 text-muted">
        {english ? "Switch language" : "เปลี่ยนภาษา"}
      </h2>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            await setLanguage(english ? "th" : "en");
            router.refresh();
          })
        }
        className="flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left text-sm text-ink/80 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          {english ? "🇹🇭" : "🇺🇸"}
        </span>
        <span lang={english ? "th" : "en"}>
          {english ? "ภาษาไทย" : "English Language"}
        </span>
      </button>
    </section>
  );
}
