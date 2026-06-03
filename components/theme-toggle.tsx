"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

export function ThemeToggle() {
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
        className="h-7 w-7 rounded-pill"
        tabIndex={-1}
      />
    );
  }

  const Icon = theme === "dark" ? Sun : Moon;
  const label =
    theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-muted hover:bg-surface hover:text-ink transition-colors"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
