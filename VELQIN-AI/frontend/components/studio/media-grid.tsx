"use client";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Copy, Download, FolderKanban, Heart, Play, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { MediaItem } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/dialog";

export type MediaAction = { label: string; icon: React.ReactNode; onClick: (m: MediaItem) => void };

export function MediaGrid({ items, onChange, actions, empty, columns = "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4", openId }: {
  items: MediaItem[]; onChange: (items: MediaItem[]) => void; actions?: MediaAction[]; empty?: React.ReactNode; columns?: string; openId?: string | null;
}) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (openId) {
      const i = items.findIndex((m) => m.id === openId);
      if (i >= 0) setOpen(i);
    }
  }, [openId, items]);
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <div className={cn("grid gap-2 sm:gap-3", columns)}>
        <AnimatePresence initial={false}>
          {items.map((m, i) => (
            <motion.button
              layout
              key={m.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={() => setOpen(i)}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2"
            >
              {m.has_thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${m.id}/thumb`} alt={m.prompt} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full items-center justify-center text-subtle"><Play /></div>
              )}
              {m.kind === "video" && (
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur"><Play className="h-3 w-3 fill-current" />{m.duration ? `${m.duration.toFixed(1)}s` : "video"}</span>
              )}
              {m.favorite && <Heart className="absolute right-2 top-2 h-4 w-4 fill-white text-white drop-shadow" />}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <Lightbox items={items} index={open} setIndex={setOpen} onChange={onChange} actions={actions} />
    </>
  );
}

function Lightbox({ items, index, setIndex, onChange, actions }: { items: MediaItem[]; index: number | null; setIndex: (i: number | null) => void; onChange: (items: MediaItem[]) => void; actions?: MediaAction[] }) {
  const m = index != null ? items[index] : null;
  const toast = useStore((s) => s.toast);
  const projects = useStore((s) => s.projects);
  const loadProjects = useStore((s) => s.loadProjects);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (index == null) return;
    loadProjects();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") setIndex(Math.min(items.length - 1, (index ?? 0) + 1));
      if (e.key === "ArrowLeft") setIndex(Math.max(0, (index ?? 0) - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, setIndex, loadProjects]);

  async function patch(body: Record<string, unknown>) {
    if (!m) return;
    const r = await api<{ item: MediaItem }>(`/api/media/${m.id}`, { method: "PATCH", body });
    onChange(items.map((x) => (x.id === m.id ? r.item : x)));
  }
  async function del() {
    if (!m) return;
    await api(`/api/media/${m.id}`, { method: "DELETE" });
    setConfirm(false);
    onChange(items.filter((x) => x.id !== m.id));
    setIndex(null);
    toast({ title: "Deleted", tone: "success" });
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {m && (
        <motion.div className="fixed inset-0 z-[75] flex flex-col bg-black/90 backdrop-blur-sm lg:flex-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="pt-safe relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={() => setIndex(null)}>
            {m.kind === "video" ? (
              <video key={m.id} src={`/api/media/${m.id}/file`} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={`/api/media/${m.id}/file`} alt={m.prompt} className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
            )}
            <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setIndex(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            {index! > 0 && <button className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setIndex(index! - 1); }} aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>}
            {index! < items.length - 1 && <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setIndex(index! + 1); }} aria-label="Next"><ChevronRight className="h-5 w-5" /></button>}
          </div>
          <div className="pb-safe scroll-thin max-h-[42dvh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-elevated p-5 text-fg lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0">
            <div className="text-xs text-subtle">{m.kind === "video" ? "Video" : "Image"} · {m.width}×{m.height}{m.duration ? ` · ${m.duration.toFixed(1)} s` : ""} · {timeAgo(m.created_at)}</div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{m.prompt || <span className="text-subtle">No prompt</span>}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-subtle">
              {Object.entries(m.params).filter(([k, v]) => v != null && v !== "" && ["preset", "mode", "seed", "aspect", "quality", "style", "fps", "segments"].includes(k)).map(([k, v]) => (
                <span key={k} className="rounded-full bg-surface-2 px-2 py-0.5">{k}: {String(v)}</span>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <a href={`/api/media/${m.id}/file?download=true`} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-fg text-sm font-medium text-bg"><Download className="h-4 w-4" />Download</a>
              <button onClick={() => patch({ favorite: !m.favorite })} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm"><Heart className={cn("h-4 w-4", m.favorite && "fill-current text-danger")} />{m.favorite ? "Favorited" : "Favorite"}</button>
              {m.prompt && <button onClick={() => { navigator.clipboard?.writeText(m.prompt); toast({ title: "Prompt copied" }); }} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm"><Copy className="h-4 w-4" />Copy prompt</button>}
              {actions?.map((a) => (
                <button key={a.label} onClick={() => { a.onClick(m); setIndex(null); }} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm">{a.icon}{a.label}</button>
              ))}
              <button onClick={() => setConfirm(true)} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/30 text-sm text-danger"><Trash2 className="h-4 w-4" />Delete</button>
            </div>
            {projects.length > 0 && (
              <div className="mt-5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs text-subtle"><FolderKanban className="h-3.5 w-3.5" />Project</div>
                <select value={m.project_id ?? ""} onChange={(e) => patch(e.target.value ? { project_id: e.target.value } : { clear_project: true })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm">
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={del} title="Delete this item?" description="The file is permanently removed from the server." />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

