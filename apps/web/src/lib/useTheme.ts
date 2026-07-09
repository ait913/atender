import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";

const STORAGE_KEY = "theme";
const MQ = "(prefers-color-scheme: dark)";

export function readStored(): Theme {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  return "auto";
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(MQ).matches ? "dark" : "light";
}

function applyResolved(resolved: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function initTheme(): void {
  applyResolved(resolveTheme(readStored()));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    applyResolved(resolveTheme(theme));
    if (theme !== "auto") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MQ);
    const onChange = () => applyResolved(resolveTheme("auto"));
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window === "undefined") return;
    if (next === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  };

  return { theme, setTheme };
}
