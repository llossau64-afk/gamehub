"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:bottom-5 sm:top-auto sm:items-end sm:px-5">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-elevated px-4 py-3 shadow-float")}
          >
            <span className={cn("mt-0.5", t.tone === "error" ? "text-danger" : t.tone === "success" ? "text-success" : "text-accent")}>
              {t.tone === "error" ? <AlertCircle className="h-4 w-4" /> : t.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t.title}</div>
              {t.description ? <div className="mt-0.5 text-[13px] text-muted">{t.description}</div> : null}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-subtle hover:text-fg" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
