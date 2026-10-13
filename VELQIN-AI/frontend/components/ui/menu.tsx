"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Lightweight popover menu anchored to a trigger, rendered in a portal (never clipped). */
export function Menu({ trigger, children, align = "start", side = "bottom", className, width = 240 }: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
  className?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    let left = align === "start" ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (side === "top") setPos({ left, bottom: window.innerHeight - r.top + 6 });
    else setPos({ left, top: r.bottom + 6 });
  }, [open, align, side, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !ref.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref })}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panel}
                initial={{ opacity: 0, y: side === "top" ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: side === "top" ? 4 : -4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 16 : width) }}
                className={cn("z-[90] max-h-[70dvh] overflow-y-auto scroll-thin rounded-2xl border border-line bg-elevated p-1.5 shadow-float", className)}
                role="menu"
              >
                {children(() => setOpen(false))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({ children, onClick, icon, danger, active, disabled, hint }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; danger?: boolean; active?: boolean; disabled?: boolean; hint?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-45",
        danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-surface-2",
        active && "bg-surface-2",
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0 text-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {hint ? <span className="mt-0.5 block text-xs text-subtle">{hint}</span> : null}
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}
