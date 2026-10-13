"use client";
import { cn } from "@/lib/utils";

export function Badge({ children, className, tone = "default" }: { children: React.ReactNode; className?: string; tone?: "default" | "accent" | "success" | "warning" | "danger" }) {
  const tones = {
    default: "bg-surface-2 text-muted border-line",
    accent: "bg-accent-soft text-accent border-transparent",
    success: "bg-success/10 text-success border-transparent",
    warning: "bg-warning/12 text-warning border-transparent",
    danger: "bg-danger/10 text-danger border-transparent",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function StatusDot({ on, className }: { on: boolean; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", on ? "bg-success shadow-[0_0_0_3px] shadow-success/15" : "bg-danger/80", className)} />;
}

export function Progress({ value, className, indeterminate }: { value: number; className?: string; indeterminate?: boolean }) {
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-accent to-accent-2" />
      ) : (
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
      )}
      <style>{`@keyframes slide{0%{left:-35%}100%{left:100%}}`}</style>
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-40", checked ? "bg-accent" : "bg-line-strong")}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, className, size = "md" }: { options: { value: T; label: React.ReactNode; disabled?: boolean; title?: string }[]; value: T; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("inline-flex rounded-xl border border-line bg-surface-2 p-1", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-lg font-medium transition-all disabled:opacity-35",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-soft", className)}>{children}</div>;
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div> : null}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children ? <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger"; title?: string; children: React.ReactNode; className?: string }) {
  const t = { info: "border-accent/25 bg-accent-soft", warning: "border-warning/30 bg-warning/8", danger: "border-danger/30 bg-danger/8" }[tone];
  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", t, className)}>
      {title ? <div className="mb-0.5 font-semibold text-fg">{title}</div> : null}
      <div className="text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px]">{children}</div>
    </div>
  );
}
