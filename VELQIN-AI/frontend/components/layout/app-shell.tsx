"use client";
import { AnimatePresence, motion } from "motion/react";
import { Menu as MenuIcon } from "lucide-react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { LogoMark } from "@/components/ui/logo";

export function AppShell({ children, title, actions, bare }: { children: React.ReactNode; title?: React.ReactNode; actions?: React.ReactNode; bare?: boolean }) {
  const open = useStore((s) => s.sidebarOpen);
  const setSidebar = useStore((s) => s.setSidebar);
  const setPalette = useStore((s) => s.setPalette);
  const loadModels = useStore((s) => s.loadModels);
  const loadChats = useStore((s) => s.loadChats);
  const loadStatus = useStore((s) => s.loadStatus);
  const pathname = usePathname();

  useEffect(() => {
    loadModels();
    loadChats();
    loadStatus();
    const t = setInterval(loadStatus, 20000);
    return () => clearInterval(t);
  }, [loadModels, loadChats, loadStatus]);

  useEffect(() => setSidebar(false), [pathname, setSidebar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  return (
    <div className="h-app flex overflow-hidden bg-bg">
      {/* desktop sidebar */}
      <aside className="hidden w-[272px] shrink-0 border-r border-line bg-bg-soft lg:flex">
        <Sidebar />
      </aside>
      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebar(false)} />
            <motion.aside
              className="pt-safe absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] border-r border-line bg-bg-soft shadow-float"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              drag="x"
              dragConstraints={{ left: -320, right: 0 }}
              dragElastic={0.05}
              onDragEnd={(_, info) => info.offset.x < -80 && setSidebar(false)}
            >
              <Sidebar />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {!bare && (
          <header className="pt-safe sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/80 px-3 backdrop-blur-xl lg:px-6">
            <button className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg lg:hidden" onClick={() => setSidebar(true)} aria-label="Open menu">
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className={cn("min-w-0 flex-1 truncate font-display text-[15px] font-semibold")}>{title}</div>
            {actions}
          </header>
        )}
        {bare && (
          <button
            className="pt-safe absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg lg:hidden"
            onClick={() => setSidebar(true)}
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
            <LogoMark size={20} />
          </button>
        )}
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
      <CommandPalette />
    </div>
  );
}
