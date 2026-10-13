"use client";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg placeholder:text-subtle",
        "outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-fg placeholder:text-subtle",
        "outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent-soft scroll-thin",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-[13px] font-medium text-muted", className)}>
      {children}
    </label>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
