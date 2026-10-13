"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, upload } from "@/lib/api";

/** Records audio in the browser and transcribes it locally on the VELQIN server (faster-whisper). */
export function useVoice(onText: (t: string) => void) {
  const [available, setAvailable] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;
    api<{ stt: boolean }>("/api/voice/status").then((r) => setAvailable(r.stt)).catch(() => setAvailable(false));
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        setBusy(true);
        try {
          const form = new FormData();
          const ext = (r.mimeType || "").includes("mp4") ? "m4a" : (r.mimeType || "").includes("ogg") ? "ogg" : "webm";
          form.append("file", blob, `voice.${ext}`);
          const res = await upload<{ text: string }>("/api/voice/transcribe", form);
          if (res.text) onText(res.text);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      };
      rec.current = r;
      r.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied.");
    }
  }, [onText]);

  const stop = useCallback(() => {
    rec.current?.stop();
    setRecording(false);
  }, []);

  return { available, recording, busy, error, start, stop };
}
