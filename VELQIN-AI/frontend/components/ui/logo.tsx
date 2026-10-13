"use client";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** VELQIN mark: two crossing facets forming a "V" — violet→blue facet over a silver facet. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  // unique gradient ids per instance — shared ids break when the first instance is hidden (display:none)
  const uid = useId().replace(/:/g, "");
  const a = `vqa${uid}`;
  const b = `vqb${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={a} x1="4" y1="6" x2="18" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--accent, #7c6cf2)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent-2, #4f7cff)" }} />
        </linearGradient>
        <linearGradient id={b} x1="28" y1="6" x2="15" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#dfe2ec" />
          <stop offset="1" stopColor="#8f95ab" />
        </linearGradient>
      </defs>
      <path d="M28.5 6H22.2L14.6 26H20.4Z" fill={`url(#${b})`} />
      <path d="M3.5 6H9.8L18 26H12.2Z" fill={`url(#${a})`} />
      <path d="M14.6 26H18L16.9 23.3Z" style={{ fill: "var(--accent-2, #4f7cff)" }} opacity="0.55" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-[1.05rem] font-semibold tracking-[0.22em] text-fg">VELQIN</span>
      )}
    </div>
  );
}
