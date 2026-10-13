"use client";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Dialog({ open, onClose, title, description, children, className, footer, wide }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode;
  className?: string; footer?: React.ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("input, textarea, button[data-autofocus], select");
      el?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className={cn(
              "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-elevated shadow-float sm:rounded-3xl",
              wide ? "sm:max-w-3xl" : "sm:max-w-lg",
              className,
            )}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-6">
                <div>
                  {title ? <h2 className="font-display text-lg font-semibold">{title}</h2> : null}
                  {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
                </div>
                <button onClick={onClose} className="-mr-2 -mt-1 rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 pb-safe">{footer}</div> : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Delete", danger = true, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-surface-2" onClick={onClose}>Cancel</button>
          <button
            data-autofocus
            disabled={loading}
            className={cn("h-10 rounded-xl px-4 text-sm font-medium text-white disabled:opacity-50", danger ? "bg-danger" : "bg-fg text-bg")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
