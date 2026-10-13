"use client";
import { AnimatePresence, motion } from "motion/react";
import { Clapperboard, FileText, FolderKanban, Image as ImageIcon, MessageSquare, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Results = {
  chats: { id: string; title: string }[];
  messages: { id: string; chat_id: string; chat_title: string; snippet: string }[];
  files: { id: string; filename: string; kind: string }[];
  media: { id: string; kind: string; prompt: string }[];
  projects: { id: string; name: string }[];
};
type Item = { key: string; icon: React.ReactNode; title: string; sub?: string; go: () => void };

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPalette);
  const chats = useStore((s) => s.chats);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setRes(null);
      setSel(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) return setRes(null);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<Results>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then(setRes).catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const items: Item[] = useMemo(() => {
    if (!q.trim()) {
      return [
        { key: "new", icon: <Plus />, title: "New chat", go: () => go(`/?new=${Date.now()}`) },
        { key: "img", icon: <ImageIcon />, title: "Open Image Studio", go: () => go("/images/") },
        { key: "vid", icon: <Clapperboard />, title: "Open VELQIN Motion", go: () => go("/video/") },
        ...chats.slice(0, 6).map((c) => ({ key: `c${c.id}`, icon: <MessageSquare />, title: c.title, sub: "Recent chat", go: () => go(`/?c=${c.id}`) })),
      ];
    }
    if (!res) return [];
    return [
      ...res.chats.map((c) => ({ key: `c${c.id}`, icon: <MessageSquare />, title: c.title, sub: "Chat", go: () => go(`/?c=${c.id}`) })),
      ...res.messages.map((m) => ({ key: `m${m.id}`, icon: <MessageSquare />, title: m.snippet, sub: `In “${m.chat_title}”`, go: () => go(`/?c=${m.chat_id}`) })),
      ...res.projects.map((p) => ({ key: `p${p.id}`, icon: <FolderKanban />, title: p.name, sub: "Project", go: () => go(`/projects/?p=${p.id}`) })),
      ...res.files.map((f) => ({ key: `f${f.id}`, icon: <FileText />, title: f.filename, sub: "File", go: () => go(`/library/?tab=files&q=${encodeURIComponent(f.filename)}`) })),
      ...res.media.map((m) => ({ key: `i${m.id}`, icon: m.kind === "video" ? <Clapperboard /> : <ImageIcon />, title: m.prompt || "(no prompt)", sub: m.kind === "video" ? "Video" : "Image", go: () => go(`/library/?item=${m.id}`) })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, res, chats]);

  useEffect(() => setSel(0), [items.length]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85] flex items-start justify-center px-3 pt-[10vh]">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-elevated shadow-float"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-subtle" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                  if (e.key === "Enter") items[sel]?.go();
                }}
                placeholder="Search chats, messages, files, images…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
              />
            </div>
            <div className="scroll-thin max-h-[55vh] overflow-y-auto p-2">
              {q.trim() && res && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-subtle">No results for “{q}”.</p>}
              {items.map((it, i) => (
                <button
                  key={it.key}
                  onMouseEnter={() => setSel(i)}
                  onClick={it.go}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === sel ? "bg-surface-2" : "")}
                >
                  <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{it.title}</span>
                    {it.sub ? <span className="block truncate text-xs text-subtle">{it.sub}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
