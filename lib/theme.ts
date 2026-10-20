export const THEME_KEY = "arween-theme";

export type Theme = "light" | "dark";

/** A saved choice wins. Otherwise follow the operating system. */
export function themeFromPreference(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

/** Runs before paint so the first frame matches the saved or system theme. */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;
