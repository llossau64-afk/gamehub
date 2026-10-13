"use client";
import { motion } from "motion/react";
import { Logo } from "@/components/ui/logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="h-app ambient relative flex flex-col overflow-y-auto bg-bg">
      <div className="pt-safe flex items-center justify-between px-6 py-5">
        <Logo />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-[400px]">
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle ? <p className="mt-2 text-[15px] text-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
        </motion.div>
      </div>
      <div className="pb-safe px-6 py-4 text-center text-xs text-subtle">VELQIN AI · Create Without Limits · Private & self-hosted</div>
    </div>
  );
}
