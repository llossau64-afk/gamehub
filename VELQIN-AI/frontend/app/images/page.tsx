"use client";
import { AnimatePresence } from "motion/react";
import { Brush, Dices, Expand, ImageIcon, Lock, Maximize2, Shuffle, Sparkles, Wand2 } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Notice, Segmented, Skeleton } from "@/components/ui/misc";
import { JobCard } from "@/components/studio/job-card";
import { MaskEditor } from "@/components/studio/mask-editor";
import { MediaGrid } from "@/components/studio/media-grid";
import { SourcePicker, type SourceRef } from "@/components/studio/source-picker";
import { useJobs } from "@/hooks/use-jobs";
import { api } from "@/lib/api";
import { hasFeature, useStore } from "@/lib/store";
import type { Job, MediaItem, Preset } from "@/lib/types";
import { cn } from "@/lib/utils";

type PresetsResponse = { comfyui_online: boolean; presets: Preset[]; styles: string[]; timings: Record<string, number> };
type Mode = "t2i" | "i2i" | "inpaint" | "outpaint" | "upscale";

const MODES: { id: Mode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "t2i", label: "Create", icon: Sparkles, hint: "Text to image" },
  { id: "i2i", label: "Remix", icon: Shuffle, hint: "Image to image · style change · variations" },
  { id: "inpaint", label: "Inpaint", icon: Brush, hint: "Change a painted area (e.g. background)" },
  { id: "outpaint", label: "Extend", icon: Expand, hint: "Outpainting — grow the canvas" },
  { id: "upscale", label: "Upscale", icon: Maximize2, hint: "AI upscale ×2" },
];
const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:2", "3:4", "2:3"];
const STYLE_LABEL: Record<string, string> = { none: "None", photo: "Photo", cinematic: "Cinematic", anime: "Anime", "digital-art": "Digital art", "3d": "3D render", watercolor: "Watercolor", "pixel-art": "Pixel art", minimal: "Minimal" };

function AspectIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const s = 14 / Math.max(w, h);
  return <span className="inline-block rounded-[3px] border-[1.5px] border-current" style={{ width: w * s, height: h * s }} />;
}

export default function ImagesPage() {
  return (
    <Suspense fallback={null}>
      <ImageStudio />
    </Suspense>
  );
}

function ImageStudio() {
  const user = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);
  const params = useSearchParams();
  const canEdit = hasFeature(user, "image_edit");
  const advanced = hasFeature(user, "advanced_settings");
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [mode, setMode] = useState<Mode>("t2i");
  const [preset, setPreset] = useState("sdxl");
  const [prompt, setPrompt] = useState(params.get("prompt") ?? "");
  const [negative, setNegative] = useState("");
  const [style, setStyle] = useState("none");
  const [aspect, setAspect] = useState("1:1");
  const [quality, setQuality] = useState<"fast" | "balanced" | "quality">("fast");
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState("");
  const [strength, setStrength] = useState(0.65);
  const [source, setSource] = useState<SourceRef>(null);
  const [mask, setMask] = useState<string | null>(null);
  const [maskOpen, setMaskOpen] = useState(false);
  const [extend, setExtend] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [submitting, setSubmitting] = useState(false);

  const loadMedia = useCallback(async () => {
    const r = await api<{ items: MediaItem[] }>("/api/media?kind=image&limit=120").catch(() => null);
    if (r) setMedia(r.items);
  }, []);
  const { jobs, previews, cancel, retry, remove, add } = useJobs("image", () => loadMedia());

  useEffect(() => {
    api<PresetsResponse>("/api/studio/presets").then((p) => {
      setPresets(p);
      const firstAvail = p.presets.find((x) => x.kind === "image" && x.id !== "upscale" && x.available);
      if (firstAvail) setPreset(firstAvail.id);
    }).catch(() => setPresets({ comfyui_online: false, presets: [], styles: [], timings: {} }));
    loadMedia();
  }, [loadMedia]);
  useEffect(() => setMask(null), [source]);

  const imagePresets = presets?.presets.filter((p) => p.kind === "image" && p.id !== "upscale") ?? [];
  const current = mode === "upscale" ? presets?.presets.find((p) => p.id === "upscale") : imagePresets.find((p) => p.id === preset);
  const modeSupported = mode === "upscale" || !!current?.modes.includes(mode);
  const needsSource = mode !== "t2i";
  const ready = !!current?.available && modeSupported && (!needsSource || !!source) && (mode !== "inpaint" || !!mask) &&
    (mode === "upscale" || mode === "outpaint" || mode === "inpaint" || prompt.trim().length > 0 || mode === "i2i") &&
    (mode !== "t2i" || prompt.trim().length > 0) && (mode !== "outpaint" || Object.values(extend).some((v) => v > 0));

  async function generate() {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        preset, mode, prompt, negative, style, aspect, quality, count, strength,
        seed: seed.trim() ? Number(seed) : null,
        input_file_id: source?.fileId, input_media_id: source?.mediaId, mask_png: mode === "inpaint" ? mask : undefined,
        outpaint: mode === "outpaint" ? extend : undefined,
      };
      const r = await api<{ job: Job }>("/api/studio/image", { body });
      add(r.job);
    } catch (e) {
      toast({ title: "Could not start", description: (e as Error).message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const useAsSource = (m: MediaItem) => {
    setSource({ mediaId: m.id, url: `/api/media/${m.id}/file`, name: "Library image" });
    if (mode === "t2i") setMode("i2i");
  };
  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running" || ((j.status === "failed" || j.status === "cancelled") && Date.now() - new Date(j.finished_at ?? j.created_at).getTime() < 3600_000));
  const estimate = presets?.timings[`image:${mode}:${quality}:${aspect}`];

  return (
    <AppShell title={<span className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-accent" />Image Studio</span>}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* controls */}
        <div className="scroll-thin shrink-0 space-y-5 border-line p-4 sm:p-6 lg:w-[400px] lg:overflow-y-auto lg:border-r">
          {presets && !presets.comfyui_online && (
            <Notice tone="warning" title="Image engine offline">ComfyUI isn't running on the server. Start it with <code>scripts\start-comfyui.bat</code> (see docs/IMAGE_VIDEO_SETUP.md).</Notice>
          )}
          <div className="grid grid-cols-5 gap-1 rounded-2xl border border-line bg-surface-2 p-1">
            {MODES.map((m) => {
              const locked = m.id !== "t2i" && !canEdit;
              return (
                <button key={m.id} title={locked ? `${m.hint} — VELQIN Creator` : m.hint} disabled={locked} onClick={() => setMode(m.id)}
                  className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition disabled:opacity-40", mode === m.id ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
                  {locked ? <Lock className="h-4 w-4" /> : <m.icon className="h-4 w-4" />}
                  {m.label}
                </button>
              );
            })}
          </div>

          {needsSource && (
            <div className="space-y-2">
              <SourcePicker value={source} onChange={setSource} />
              {mode === "inpaint" && source && (
                <Button variant={mask ? "subtle" : "secondary"} className="w-full" onClick={() => setMaskOpen(true)}><Brush className="h-4 w-4" />{mask ? "Edit painted area" : "Paint the area to change"}</Button>
              )}
              {mode === "outpaint" && source && (
                <div>
                  <div className="mb-1.5 text-[13px] font-medium text-muted">Extend canvas</div>
                  <div className="grid grid-cols-4 gap-2">
                    {(["left", "top", "right", "bottom"] as const).map((d) => (
                      <button key={d} onClick={() => setExtend({ ...extend, [d]: extend[d] ? 0 : 0.3 })} className={cn("rounded-xl border py-2 text-xs capitalize", extend[d] ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {mode !== "upscale" && (
            <>
              <Field label={mode === "inpaint" ? "What should appear in the painted area?" : "Prompt"}>
                <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={2000}
                  placeholder={mode === "t2i" ? "A cinematic shot of a futuristic car in a rainy neon city at night, reflections on wet asphalt" : "Describe the result you want"} />
              </Field>
              <Field label="Model">
                <div className="space-y-2">
                  {presets ? imagePresets.map((p) => (
                    <button key={p.id} onClick={() => setPreset(p.id)} disabled={!p.available}
                      className={cn("w-full rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed", preset === p.id ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong", !p.available && "opacity-60")}>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="mt-0.5 text-xs text-subtle">{p.available ? p.description : presets.comfyui_online ? `Missing: ${p.missing.join(", ")}` : "Unavailable while ComfyUI is offline"}</div>
                    </button>
                  )) : <Skeleton className="h-16" />}
                </div>
              </Field>
              <Field label="Style">
                <div className="flex flex-wrap gap-1.5">
                  {(presets?.styles ?? ["none"]).map((s) => (
                    <button key={s} onClick={() => setStyle(s)} className={cn("rounded-full border px-3 py-1.5 text-xs transition", style === s ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg")}>{STYLE_LABEL[s] ?? s}</button>
                  ))}
                </div>
              </Field>
              {mode === "t2i" && (
                <Field label="Format">
                  <div className="flex flex-wrap gap-1.5">
                    {ASPECTS.map((a) => (
                      <button key={a} onClick={() => setAspect(a)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition", aspect === a ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg")}>
                        <AspectIcon ratio={a} />{a}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <Field label="Quality" hint={quality === "fast" ? "Lightning: 4 steps — a few seconds per image." : quality === "balanced" ? "8 steps (uses the 8-step LoRA if installed)." : "25 full steps with negative prompt — slower, more detail."}>
                <Segmented value={quality} onChange={setQuality} className="w-full" options={[{ value: "fast", label: "Fast" }, { value: "balanced", label: "Balanced" }, { value: "quality", label: "Quality", disabled: !advanced, title: advanced ? undefined : "VELQIN Creator" }]} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Images">
                  <Segmented value={count} onChange={setCount} className="w-full" options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
                </Field>
                <Field label="Seed" hint={advanced ? "Empty = random" : "Creator plan"}>
                  <div className="flex gap-1.5">
                    <Input value={seed} disabled={!advanced} onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="random" className="h-10" />
                    <Button size="icon" variant="ghost" disabled={!advanced} onClick={() => setSeed(String(Math.floor(Math.random() * 1e12)))} aria-label="Random seed"><Dices className="h-4 w-4" /></Button>
                  </div>
                </Field>
              </div>
              {(mode === "i2i" || mode === "inpaint") && (
                <Field label={`Change strength · ${Math.round(strength * 100)}%`} hint="Low keeps the original, high follows the prompt. Inpaint at 100% fully replaces the painted area.">
                  <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                </Field>
              )}
              {quality === "quality" && (
                <Field label="Negative prompt"><Input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blurry, text, watermark" /></Field>
              )}
            </>
          )}
          {mode === "upscale" && current && !current.available && <Notice tone="warning">Upscaling needs <code>RealESRGAN_x4plus.pth</code> in ComfyUI/models/upscale_models.</Notice>}
          {current && !modeSupported && <Notice tone="warning">{current.name} doesn't support this mode — choose another model.</Notice>}
          <Button variant="primary" size="lg" className="w-full" onClick={generate} loading={submitting} disabled={!ready}>
            <Wand2 className="h-4 w-4" />{mode === "upscale" ? "Upscale" : count > 1 ? `Generate ${count} images` : "Generate"}
          </Button>
          <p className="text-center text-[11px] text-subtle">Free & unlimited — generated locally on your server's GPU.</p>
        </div>

        {/* results */}
        <div className="scroll-thin min-h-0 flex-1 space-y-6 p-4 sm:p-6 lg:overflow-y-auto">
          {activeJobs.length > 0 && (
            <div className="grid gap-3 xl:grid-cols-2">
              <AnimatePresence>
                {activeJobs.map((j) => (
                  <JobCard key={j.id} job={j} preview={previews[j.id]} estimate={estimate} onCancel={() => cancel(j.id)} onRetry={() => retry(j.id).catch((e) => toast({ title: "Retry failed", description: e.message, tone: "error" }))} onDismiss={() => remove(j.id)} />
                ))}
              </AnimatePresence>
            </div>
          )}
          <div>
            <h2 className="mb-3 font-display text-base font-semibold">Your images</h2>
            {media === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
            ) : (
              <MediaGrid
                items={media}
                onChange={setMedia}
                actions={canEdit ? [
                  { label: "Remix", icon: <Shuffle className="h-4 w-4" />, onClick: (m) => { useAsSource(m); setMode("i2i"); setPrompt(m.prompt); } },
                  { label: "Upscale", icon: <Maximize2 className="h-4 w-4" />, onClick: (m) => { useAsSource(m); setMode("upscale"); } },
                  { label: "Inpaint", icon: <Brush className="h-4 w-4" />, onClick: (m) => { useAsSource(m); setMode("inpaint"); } },
                ] : [{ label: "Reuse prompt", icon: <Sparkles className="h-4 w-4" />, onClick: (m) => setPrompt(m.prompt) }]}
                empty={<EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No images yet">Describe an image on the left and press Generate. Results are saved to your private library.</EmptyState>}
              />
            )}
          </div>
        </div>
      </div>
      <MaskEditor open={maskOpen} src={source?.url ?? null} onClose={() => setMaskOpen(false)} onDone={(d) => { setMask(d); setMaskOpen(false); }} />
    </AppShell>
  );
}
