"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";

/** Live job list for one kind. Updates arrive via SSE (/api/jobs/events); queue positions are polled. */
export function useJobs(kind: "image" | "video", onFinished?: (job: Job) => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previews, setPreviews] = useState<Record<string, number>>({});
  const [queueLength, setQueueLength] = useState(0);
  const finishedCb = useRef(onFinished);
  finishedCb.current = onFinished;

  const refresh = useCallback(async () => {
    const r = await api<{ jobs: Job[]; queue_length: number }>(`/api/jobs?kind=${kind}&limit=30`).catch(() => null);
    if (r) {
      setJobs(r.jobs);
      setQueueLength(r.queue_length);
    }
  }, [kind]);

  useEffect(() => {
    refresh();
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/jobs/events", { withCredentials: true });
      es.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === "job" && ev.job.kind === kind) {
          setJobs((js) => {
            const prev = js.find((j) => j.id === ev.job.id);
            if (prev && prev.status !== "done" && ev.job.status === "done") finishedCb.current?.(ev.job);
            const merged = { ...ev.job, position: ev.job.status === "queued" ? prev?.position ?? ev.job.position : null };
            return prev ? js.map((j) => (j.id === ev.job.id ? merged : j)) : [merged, ...js];
          });
        } else if (ev.type === "preview") {
          setPreviews((p) => ({ ...p, [ev.job_id]: ev.t }));
        }
      };
      es.onerror = () => {
        es?.close();
        retry = setTimeout(() => {
          refresh();
          connect();
        }, 3000);
      };
    };
    connect();
    return () => {
      es?.close();
      clearTimeout(retry);
    };
  }, [kind, refresh]);

  const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [hasActive, refresh]);

  const cancel = async (id: string) => {
    await api(`/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => {});
    refresh();
  };
  const retryJob = async (id: string) => {
    const r = await api<{ job: Job }>(`/api/jobs/${id}/retry`, { method: "POST" });
    setJobs((js) => [r.job, ...js]);
  };
  const remove = async (id: string) => {
    await api(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
    setJobs((js) => js.filter((j) => j.id !== id));
  };
  const add = (j: Job) => setJobs((js) => [j, ...js.filter((x) => x.id !== j.id)]);

  return { jobs, previews, queueLength, refresh, cancel, retry: retryJob, remove, add };
}
