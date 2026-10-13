"use client";
import { motion } from "motion/react";
import { AlertTriangle, Ban, Clock, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/misc";
import type { Job } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

export function JobCard({ job, preview, onCancel, onRetry, onDismiss, estimate }: {
  job: Job; preview?: number; onCancel: () => void; onRetry: () => void; onDismiss: () => void; estimate?: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (job.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job.status]);
  const elapsed = job.started_at ? (now - new Date(job.started_at).getTime()) / 1000 : 0;
  const prompt = job.params.prompt || (job.params.mode === "upscale" ? "Upscale ×2" : "");

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex gap-3 p-3.5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {job.status === "running" && preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/jobs/${job.id}/preview?t=${preview}`} alt="Live preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-subtle">
              {job.status === "running" ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : job.status === "queued" ? <Clock className="h-5 w-5" /> : job.status === "failed" ? <AlertTriangle className="h-5 w-5 text-danger" /> : <Ban className="h-5 w-5" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-[13px] leading-snug">{prompt || <span className="text-subtle">No prompt</span>}</p>
            {(job.status === "queued" || job.status === "running") ? (
              <button onClick={onCancel} className="rounded-lg p-1 text-subtle hover:bg-surface-2 hover:text-fg" title="Cancel" aria-label="Cancel job"><X className="h-4 w-4" /></button>
            ) : (
              <button onClick={onDismiss} className="rounded-lg p-1 text-subtle hover:bg-surface-2 hover:text-fg" title="Remove from list" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            )}
          </div>
          <div className={cn("mt-1 text-xs", job.status === "failed" ? "text-danger" : "text-subtle")}>
            {job.status === "queued" && (job.position ? `In queue · position ${job.position}` : "In queue")}
            {job.status === "running" && `${job.step || "Working"} · ${formatDuration(elapsed)}${estimate ? ` of ~${formatDuration(estimate)}` : ""}`}
            {job.status === "failed" && (job.error || "Failed")}
            {job.status === "cancelled" && "Cancelled"}
          </div>
          {job.status === "running" && <Progress value={job.progress} className="mt-2" indeterminate={job.progress < 0.02} />}
          {job.status === "queued" && <Progress value={0} className="mt-2" indeterminate />}
          {(job.status === "failed" || job.status === "cancelled") && (
            <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"><RotateCcw className="h-3 w-3" />Retry</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
