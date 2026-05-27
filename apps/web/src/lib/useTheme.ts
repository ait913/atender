import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";

const STORAGE_KEY = "theme";

function readStored(): Theme {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  return "auto";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function initTheme() {
  apply(readStored());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window === "undefined") return;
    if (next === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  };

  return { theme, setTheme };
}
