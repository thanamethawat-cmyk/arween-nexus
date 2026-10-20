"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { THEME_KEY, type Theme } from "@/lib/theme";

export function ThemeToggle({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
  }

  const label = theme === "dark" ? t(lang, "themeLight") : t(lang, "themeDark");
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
      className="grid size-11 place-items-center rounded-full bg-[var(--aw-card)] text-[var(--aw-ink)] shadow-[0_4px_20px_rgba(45,96,255,0.06)]"
    >
      <Icon size={18} />
    </button>
  );
}
