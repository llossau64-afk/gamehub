export type ThemeMode = "system" | "dark" | "light";
export type Accent = "violet" | "blue" | "silver" | "emerald";

const KEY = "velqin.theme";

export function readTheme(): { mode: ThemeMode; accent: Accent } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { mode: "system", accent: "violet", ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { mode: "system", accent: "violet" };
}

export function applyTheme(mode: ThemeMode, accent: Accent) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", dark ? "#0a0a0f" : "#f7f7fa");
}

export function saveTheme(mode: ThemeMode, accent: Accent) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode, accent }));
  } catch {
    /* ignore */
  }
  applyTheme(mode, accent);
}

/** Inline script that runs before paint to avoid a theme flash. */
export const themeBootScript = `(function(){try{var t=JSON.parse(localStorage.getItem('${KEY}')||'{}');var m=t.mode||'system';var a=t.accent||'violet';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.accent=a;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
