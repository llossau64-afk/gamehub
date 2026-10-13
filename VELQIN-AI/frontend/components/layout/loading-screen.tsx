"use client";
import { motion } from "motion/react";
import { LogoMark } from "@/components/ui/logo";

export function LoadingScreen() {
  return (
    <div className="h-app flex flex-col items-center justify-center gap-5 bg-bg">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <motion.div
          className="absolute -inset-6 rounded-full bg-accent/15 blur-2xl"
          animate={{ opacity: [0.35, 0.8, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <LogoMark size={56} className="relative" />
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="font-display text-sm tracking-[0.35em] text-muted">
        VELQIN
      </motion.div>
    </div>
  );
}
