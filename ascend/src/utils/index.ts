import type { Weekday } from '../domain/types';

/** RFC-4122 v4 identifier. Used as primary key locally and in Supabase. */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday = 0 … Sunday = 6 */
export function weekdayOf(d: Date = new Date()): Weekday {
  return ((d.getDay() + 6) % 7) as Weekday;
}

/** Monday of the week containing d (local). */
export function startOfWeek(d: Date = new Date()): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(r, -weekdayOf(r));
}

export function weekKey(d: Date = new Date()): string {
  return dayKey(startOfWeek(d));
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(r)}`;
  return `${m}:${pad(r)}`;
}

export function formatMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const KG_PER_LB = 0.45359237;

export function toDisplayWeight(kg: number, units: 'kg' | 'lb'): number {
  const v = units === 'kg' ? kg : kg / KG_PER_LB;
  return Math.round(v * 10) / 10;
}

export function fromDisplayWeight(v: number, units: 'kg' | 'lb'): number {
  return units === 'kg' ? v : v * KG_PER_LB;
}

/** Epley estimated one-rep max. Only meaningful for reps ≤ 12. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 12) / 30);
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function groupBy<T>(xs: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}

export function relativeDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = Math.round((parseDayKey(dayKey(now)).getTime() - parseDayKey(dayKey(d)).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
