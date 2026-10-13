"use client";
import { AnimatePresence } from "motion/react";
import { Clapperboard, Dices, Film, ImagePlay, Lock, Timer, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Notice, Segmented, Skeleton } from "@/components/ui/misc";
import { JobCard } from "@/components/studio/job-card";
import { MediaGrid } from "@/components/studio/media-grid";
import { SourcePicker, type SourceRef } from "@/components/studio/source-picker";
import { useJobs } from "@/hooks/use-jobs";
import { api } from "@/lib/api";
import { hasFeature, useStore } from "@/lib/store";
import type { Job, MediaItem, Preset } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

type PresetsResponse = { comfyui_online: boolean; ffmpeg: boolean; presets: Preset[]; timings: Record<string, number>; max_video_seconds: number };
type Mode = "t2v" | "i2v" | "extend";

export default function VideoPage() {
  const user = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);
  const allowed = hasFeature(user, "video");
  const long = hasFeature(user, "long_video");
  const advanced = hasFeature(user, "advanced_settings");
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  const [videos, setVideos] = useState<MediaItem[] | null>(null);
  const [mode, setMode] = useState<Mode>("t2v");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<5 | 10 | 15 | 30>(5);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [quality, setQuality] = useState<"fast" | "balanced" | "quality">("fast");
  const [fps, setFps] = useState<16 | 24>(24);
  const [seed, setSeed] = useState("");
  const [source, setSource] = useState<SourceRef>(null);
  const [sourceVideo, setSourceVideo] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const loadVideos = useCallback(async () => {
    const r = await api<{ items: MediaItem[] }>("/api/media?kind=video&limit=60").catch(() => null);
    if (r) setVideos(r.items);
  }, []);
  const { jobs, previews, cancel, retry, remove, add } = useJobs("video", () => loadVideos());

  useEffect(() => {
    api<PresetsResponse>("/api/studio/presets").then(setPresets).catch(() => setPresets({ comfyui_online: false, ffmpeg: false, presets: [], timings: {}, max_video_seconds: 30 }));
    loadVideos();
  }, [loadVideos]);

  const preset = presets?.presets.find((p) => p.kind === "video");
  const segments = Math.ceil(duration / 5);
  const measured = presets?.timings[`video:${mode}:${quality}:${aspect}`];
  const ready = allowed && !!preset?.available && !!presets?.ffmpeg && prompt.trim().length > 0 && (mode !== "i2v" || !!source) && (mode !== "extend" || !!sourceVideo);

  async function generate() {
    setSubmitting(true);
    try {
      const r = await api<{ job: Job }>("/api/studio/video", {
        body: { preset: preset?.id ?? "wan22-5b", mode, prompt, duration: mode === "extend" ? Math.min(duration, 15) : duration, aspect, quality, fps, seed: seed ? Number(seed) : null,
          input_file_id: source?.fileId, input_media_id: source?.mediaId, source_video_id: mode === "extend" ? sourceVideo : undefined },
      });
      add(r.job);
    } catch (e) {
      toast({ title: "Could not start", description: (e as Error).message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running" || ((j.status === "failed" || j.status === "cancelled") && Date.now() - new Date(j.finished_at ?? j.created_at).getTime() < 6 * 3600_000));

  return (
    <AppShell title={<span className="flex items-center gap-2"><Clapperboard className="h-4 w-4 text-accent" />VELQIN Motion</span>}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="scroll-thin shrink-0 space-y-5 border-line p-4 sm:p-6 lg:w-[400px] lg:overflow-y-auto lg:border-r">
          {!allowed && <Notice title="VELQIN Creator feature">Video generation is part of the Creator access group. Ask the owner to enable it for you — it's free.</Notice>}
          {presets && !presets.comfyui_online && <Notice tone="warning" title="Video engine offline">ComfyUI isn't running on the server. Start it with <code>scripts\start-comfyui.bat</code>.</Notice>}
          {presets && preset && presets.comfyui_online && !preset.available && <Notice tone="warning" title="Wan 2.2 not installed">Missing: {preset.missing.join(", ")}. Run <code>scripts\download-models.ps1 -Video</code>.</Notice>}
          {presets && !presets.ffmpeg && <Notice tone="warning" title="FFmpeg missing">Install FFmpeg on the server for MP4 export (winget install Gyan.FFmpeg).</Notice>}

          <Segmented value={mode} onChange={setMode} className="w-full" options={[
            { value: "t2v", label: <span className="flex items-center justify-center gap-1.5"><Film className="h-3.5 w-3.5" />Text</span> },
            { value: "i2v", label: <span className="flex items-center justify-center gap-1.5"><ImagePlay className="h-3.5 w-3.5" />Image</span> },
            { value: "extend", label: <span className="flex items-center justify-center gap-1.5"><Timer className="h-3.5 w-3.5" />Extend</span> },
          ]} />
          {mode === "i2v" && <SourcePicker value={source} onChange={setSource} label="Start image" />}
          {mode === "extend" && (
            <Field label="Video to extend" hint="The last frame becomes the start of the new segment.">
              <select value={sourceVideo} onChange={(e) => setSourceVideo(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm">
                <option value="">Choose a video…</option>
                {videos?.map((v) => <option key={v.id} value={v.id}>{(v.prompt || "Video").slice(0, 60)} · {v.duration.toFixed(1)}s</option>)}
              </select>
            </Field>
          )}
          <Field label={mode === "i2v" ? "Describe the motion" : mode === "extend" ? "What happens next?" : "Prompt"}>
            <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={2000}
              placeholder="A cinematic shot of a futuristic car driving through a rainy city at night, neon reflections, tracking camera" />
          </Field>
          <Field label={mode === "extend" ? "Add" : "Length"} hint={duration > 5 ? `${segments} segments of ~5 s are generated one after another and joined. Expect small jumps or drift at the seams.` : "Wan 2.2 generates ~5 s per segment (121 frames at 24 fps)."}>
            <div className="grid grid-cols-4 gap-1.5">
              {([5, 10, 15, 30] as const).map((d) => {
                const locked = d > 5 && !long;
                const tooLong = presets && d > presets.max_video_seconds;
                return (
                  <button key={d} disabled={locked || !!tooLong || (mode === "extend" && d > 15)} onClick={() => setDuration(d)} title={locked ? "VELQIN Studio" : undefined}
                    className={cn("flex items-center justify-center gap-1 rounded-xl border py-2 text-sm transition disabled:opacity-40", duration === d ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg")}>
                    {locked && <Lock className="h-3 w-3" />}{d}s
                  </button>
                );
              })}
            </div>
          </Field>
          {mode !== "extend" && (
            <Field label="Format">
              <Segmented value={aspect} onChange={setAspect} className="w-full" options={[{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }]} />
            </Field>
          )}
          <Field label="Quality" hint={quality === "fast" ? "832×480 · 12 steps — the realistic choice for 8 GB VRAM." : quality === "balanced" ? "960×544 · 20 steps." : "1280×704 · 30 steps — native resolution, very slow on 8 GB."}>
            <Segmented value={quality} onChange={setQuality} className="w-full" options={[{ value: "fast", label: "Fast" }, { value: "balanced", label: "Balanced" }, { value: "quality", label: "Quality", disabled: !advanced }]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="FPS" hint={fps === 16 ? "Fewer frames, faster" : "Native"}>
              <Segmented value={fps} onChange={setFps} className="w-full" options={[{ value: 24, label: "24" }, { value: 16, label: "16" }]} />
            </Field>
            <Field label="Seed">
              <div className="flex gap-1.5">
                <Input value={seed} disabled={!advanced} onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="random" className="h-10" />
                <Button size="icon" variant="ghost" disabled={!advanced} onClick={() => setSeed(String(Math.floor(Math.random() * 1e12)))} aria-label="Random seed"><Dices className="h-4 w-4" /></Button>
              </div>
            </Field>
          </div>
          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-xs text-muted">
            <div className="flex items-center gap-1.5 font-medium text-fg"><Timer className="h-3.5 w-3.5" />Time estimate</div>
            <p className="mt-1">{measured ? `Measured on this server: ~${formatDuration(measured)} per segment → ~${formatDuration(measured * segments)} total.` : `Not measured yet on this server. On an RTX 4060, plan for several minutes per 5-second segment (longer in higher quality). The GPU is busy for the whole time.`}</p>
          </div>
          <Button variant="primary" size="lg" className="w-full" onClick={generate} loading={submitting} disabled={!ready}>
            <Wand2 className="h-4 w-4" />Generate video
          </Button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-6 p-4 sm:p-6 lg:overflow-y-auto">
          {activeJobs.length > 0 && (
            <div className="grid gap-3 xl:grid-cols-2">
              <AnimatePresence>
                {activeJobs.map((j) => (
                  <JobCard key={j.id} job={j} preview={previews[j.id]} estimate={measured ? measured * (j.result?.segments || Math.ceil((j.params.duration ?? 5) / 5)) : undefined} onCancel={() => cancel(j.id)} onRetry={() => retry(j.id).catch((e) => toast({ title: "Retry failed", description: e.message, tone: "error" }))} onDismiss={() => remove(j.id)} />
                ))}
              </AnimatePresence>
            </div>
          )}
          <div>
            <h2 className="mb-3 font-display text-base font-semibold">Your videos</h2>
            {videos === null ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square" />)}</div> : (
              <MediaGrid items={videos} onChange={setVideos}
                actions={long ? [{ label: "Extend", icon: <Timer className="h-4 w-4" />, onClick: (m) => { setMode("extend"); setSourceVideo(m.id); setPrompt(m.prompt); setDuration(5); } }] : []}
                empty={<EmptyState icon={<Clapperboard className="h-5 w-5" />} title="No videos yet">Write a prompt (or upload a start image) and generate your first clip. Videos are rendered on your server's GPU.</EmptyState>} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
