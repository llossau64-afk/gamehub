"use client";
import { Download, FileText, GalleryVerticalEnd, Heart, Image as ImageIcon, Search, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { MediaGrid } from "@/components/studio/media-grid";
import { api } from "@/lib/api";
import type { MediaItem } from "@/lib/types";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

type FileRow = { id: string; filename: string; kind: string; mime: string; size: number; project_id: string | null; text_chars: number; created_at: string };
type Tab = "images" | "videos" | "files";

export default function LibraryPage() {
  return <Suspense fallback={null}><Library /></Suspense>;
}

function Library() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "images");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [favorites, setFavorites] = useState(false);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [del, setDel] = useState<FileRow | null>(null);
  const openId = params.get("item");

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (tab === "files") {
      setFiles(null);
      const r = await api<{ files: FileRow[] }>(`/api/files?${qs}`).catch(() => ({ files: [] }));
      setFiles(r.files);
    } else {
      setMedia(null);
      qs.set("kind", tab === "images" ? "image" : "video");
      qs.set("limit", "200");
      if (favorites) qs.set("favorites", "true");
      const r = await api<{ items: MediaItem[] }>(`/api/media?${qs}`).catch(() => ({ items: [] }));
      setMedia(r.items);
    }
  }, [tab, q, favorites]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    api<{ item: MediaItem }>(`/api/media/${openId}`).then((r) => setTab(r.item.kind === "video" ? "videos" : "images")).catch(() => {});
  }, [openId]);

  async function deleteFile(f: FileRow) {
    await api(`/api/files/${f.id}`, { method: "DELETE" });
    setFiles((fs) => fs?.filter((x) => x.id !== f.id) ?? null);
    setDel(null);
  }

  return (
    <AppShell title={<span className="flex items-center gap-2"><GalleryVerticalEnd className="h-4 w-4 text-accent" />Library</span>}>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Segmented value={tab} onChange={setTab} options={[{ value: "images", label: "Images" }, { value: "videos", label: "Videos" }, { value: "files", label: "Files" }]} />
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "files" ? "Search file names" : "Search prompts"} className="pl-10" />
            </div>
            {tab !== "files" && (
              <button onClick={() => setFavorites(!favorites)} className={cn("flex h-11 items-center gap-2 rounded-xl border px-4 text-sm", favorites ? "border-danger/40 bg-danger/8 text-danger" : "border-line text-muted")}>
                <Heart className={cn("h-4 w-4", favorites && "fill-current")} />Favorites
              </button>
            )}
          </div>
          {tab === "files" ? (
            files === null ? <Skeleton className="h-40" /> : files.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="No files">Files you attach in chats or projects appear here.</EmptyState>
            ) : (
              <Card className="divide-y divide-line">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{f.kind === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.filename}</div>
                      <div className="text-xs text-subtle">{formatBytes(f.size)} · {timeAgo(f.created_at)}{f.text_chars ? ` · ${f.text_chars.toLocaleString()} characters extracted` : ""}</div>
                    </div>
                    <a href={`/api/files/${f.id}/content?download=true`} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Download"><Download className="h-4 w-4" /></a>
                    <button onClick={() => setDel(f)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </Card>
            )
          ) : media === null ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
          ) : (
            <MediaGrid items={media} onChange={setMedia} openId={openId} columns="grid-cols-3 sm:grid-cols-4 xl:grid-cols-6"
              empty={<EmptyState icon={<ImageIcon className="h-5 w-5" />} title={favorites ? "No favorites yet" : `No ${tab} yet`}>Everything you generate is stored privately on your server.</EmptyState>} />
          )}
        </div>
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && deleteFile(del)} title={`Delete ${del?.filename}?`} description="The file and its extracted text are removed." />
    </AppShell>
  );
}
