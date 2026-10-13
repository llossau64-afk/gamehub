import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(n?: number | null) {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDuration(sec?: number | null) {
  if (sec == null || !isFinite(sec)) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60 ? `${s % 60}s` : ""}`.trim();
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function groupByDate<T extends { updated_at: string; pinned?: boolean }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [];
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const add = (label: string, it: T) => {
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(it);
  };
  for (const it of items) {
    const t = new Date(it.updated_at).getTime();
    if (it.pinned) add("Pinned", it);
    else if (t >= startToday) add("Today", it);
    else if (t >= startToday - day) add("Yesterday", it);
    else if (t >= startToday - 7 * day) add("Previous 7 days", it);
    else if (t >= startToday - 30 * day) add("Previous 30 days", it);
    else add("Older", it);
  }
  return groups;
}

export const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
