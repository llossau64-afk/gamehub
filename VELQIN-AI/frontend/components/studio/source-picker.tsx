"use client";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { upload } from "@/lib/api";
import { useStore } from "@/lib/store";

export type SourceRef = { fileId?: string; mediaId?: string; url: string; name: string } | null;

/** Pick a source image: upload from device (camera roll on phones) or use an item from the library. */
export function SourcePicker({ value, onChange, label = "Source image" }: { value: SourceRef; onChange: (v: SourceRef) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useStore((s) => s.toast);

  async function pick(f: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await upload<{ file: { id: string; filename: string } }>("/api/files", form);
      onChange({ fileId: r.file.id, url: `/api/files/${r.file.id}/content`, name: r.file.filename });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-muted">{label}</div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt="" className="max-h-56 w-full object-contain" />
          <button onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white backdrop-blur" aria-label="Remove image"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <button onClick={() => input.current?.click()} className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-muted transition hover:border-accent hover:text-fg">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          {busy ? "Uploading…" : "Upload an image or pick one from your gallery"}
        </button>
      )}
    </div>
  );
}
