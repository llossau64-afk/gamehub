"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90 shadow-soft",
  secondary: "bg-surface-2 text-fg hover:bg-elevated border border-line",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  outline: "border border-line-strong text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  subtle: "bg-accent-soft text-accent hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-xl",
  "icon-sm": "h-8 w-8 rounded-lg",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium transition-all duration-150 select-none",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});
