"use client";

import { useUi } from "@/lib/i18n/use-ui";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const { ui } = useUi();
  const [theme, setTheme] = useState<Theme | null>(null);

  // Read current theme on mount (set by inline script in <head>)
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme") as Theme;
    setTheme(t || "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  // Render a placeholder until we know the theme (avoid hydration mismatch)
  if (theme === null) {
    return (
      <button
        type="button"
        aria-hidden
        className="h-11 w-full rounded-lg border border-hairline bg-canvas"
        tabIndex={-1}
      />
    );
  }

  const Icon = theme === "dark" ? Sun : Moon;
  const label =
    theme === "dark" ? ui("เปลี่ยนเป็นโหมดสว่าง") : ui("เปลี่ยนเป็นโหมดมืด");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="whitespace-nowrap">
        {theme === "dark" ? ui("ธีมสว่าง") : ui("ธีมมืด")}
      </span>
    </button>
  );
}
