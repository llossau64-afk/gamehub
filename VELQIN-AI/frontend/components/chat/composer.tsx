"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Brain, FileText, Globe, ImagePlus, Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@/lib/api";
import { hasFeature, useStore } from "@/lib/store";
import type { AttachmentInfo } from "@/lib/types";
import { cn, formatBytes, isTouch } from "@/lib/utils";
import { useVoice } from "@/hooks/use-voice";
import { ModelPicker } from "./model-picker";

type Pending = { key: string; name: string; kind: "document" | "image"; progress: number; file?: AttachmentInfo; error?: string; preview?: string };

export type ComposerSubmit = { content: string; attachments: AttachmentInfo[] };

export function Composer({
  onSubmit, onStop, streaming, model, setModel, webSearch, setWebSearch, think, setThink, autoFocus, projectId, placeholder, initialText,
}: {
  onSubmit: (p: ComposerSubmit) => Promise<boolean> | boolean | void;
  onStop: () => void;
  streaming: boolean;
  model: string;
  setModel: (m: string) => void;
  webSearch: boolean;
  setWebSearch: (v: boolean) => void;
  think: boolean;
  setThink: (v: boolean) => void;
  autoFocus?: boolean;
  projectId?: string | null;
  placeholder?: string;
  initialText?: string;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const user = useStore((s) => s.user);
  const models = useStore((s) => s.models);
  const toast = useStore((s) => s.toast);
  const voice = useVoice(useCallback((t: string) => setText((cur) => (cur ? `${cur.trimEnd()} ${t}` : t)), []));

  const canFiles = hasFeature(user, "files");
  const canWeb = hasFeature(user, "web_search");
  const selected = models.find((m) => m.id === model);
  const thinkingAvailable = model === "auto" ? models.some((m) => m.thinking && m.installed) : !!selected?.thinking;
  const uploading = pending.some((p) => !p.file && !p.error);

  useEffect(() => {
    if (initialText !== undefined) setText(initialText);
  }, [initialText]);

  // auto-grow
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus && !isTouch()) ta.current?.focus();
  }, [autoFocus]);

  async function addFiles(files: FileList | File[]) {
    if (!canFiles) {
      toast({ title: "File analysis is not enabled for your account.", tone: "error" });
      return;
    }
    for (const f of Array.from(files).slice(0, 10)) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      const isImg = f.type.startsWith("image/");
      const preview = isImg ? URL.createObjectURL(f) : undefined;
      setPending((p) => [...p, { key, name: f.name, kind: isImg ? "image" : "document", progress: 0, preview }]);
      const form = new FormData();
      form.append("file", f);
      if (projectId) form.append("project_id", projectId);
      upload<{ file: AttachmentInfo }>("/api/files", form, (pr) => setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: pr } : x))))
        .then((r) => setPending((p) => p.map((x) => (x.key === key ? { ...x, file: r.file, progress: 1 } : x))))
        .catch((e) => setPending((p) => p.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x))));
    }
  }

  async function submit() {
    if (streaming) return;
    const content = text.trim();
    const attachments = pending.filter((p) => p.file).map((p) => p.file!);
    if ((!content && !attachments.length) || uploading) return;
    const prevText = text;
    const prevPending = pending;
    setText("");
    setPending([]);
    const ok = await onSubmit({ content, attachments });
    if (ok === false) {
      setText(prevText);
      setPending(prevPending);
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-[1.6rem] border bg-surface shadow-float transition-colors",
        dragging ? "border-accent" : "border-line-strong/70 focus-within:border-line-strong",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
    >
      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {pending.map((p) => (
                <div key={p.key} className={cn("group relative flex max-w-[220px] items-center gap-2 rounded-2xl border bg-surface-2 py-1.5 pl-1.5 pr-7", p.error ? "border-danger/40" : "border-line")}>
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt="" className="h-9 w-9 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><FileText className="h-4 w-4" /></div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{p.name}</div>
                    <div className={cn("text-[11px]", p.error ? "text-danger" : "text-subtle")}>
                      {p.error ? p.error : p.file ? formatBytes(p.file.size) : `Uploading ${Math.round(p.progress * 100)}%`}
                    </div>
                  </div>
                  {!p.file && !p.error ? <Loader2 className="absolute right-2 h-3.5 w-3.5 animate-spin text-subtle" /> : (
                    <button onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))} className="absolute right-1.5 rounded-full p-1 text-subtle hover:bg-surface hover:text-fg" aria-label="Remove">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={ta}
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !isTouch() && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder ?? "Ask VELQIN anything…"}
        className="scroll-thin block max-h-[260px] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[15.5px] leading-relaxed outline-none focus-visible:outline-none placeholder:text-subtle"
        aria-label="Message"
        enterKeyHint="send"
      />

      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.html,.css,.java,.c,.cpp,.cs,.go,.rs,.sql,.yaml,.yml,.xml,.png,.jpg,.jpeg,.webp" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={imageInput} type="file" multiple hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        {canFiles && (
          <>
            <IconToggle label="Attach files (PDF, DOCX, TXT, CSV, code)" onClick={() => fileInput.current?.click()}><Paperclip className="h-[18px] w-[18px]" /></IconToggle>
            <IconToggle label="Upload image" onClick={() => imageInput.current?.click()}><ImagePlus className="h-[18px] w-[18px]" /></IconToggle>
          </>
        )}
        {canWeb && (
          <Pill active={webSearch} onClick={() => setWebSearch(!webSearch)} label="Search the web for current information">
            <Globe className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
          </Pill>
        )}
        {thinkingAvailable && (
          <Pill active={think} onClick={() => setThink(!think)} label="Let the model reason step by step before answering (slower)">
            <Brain className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Think</span>
          </Pill>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ModelPicker value={model} onChange={setModel} />
          {voice.available && !streaming && (
            <IconToggle
              label={voice.recording ? "Stop recording" : "Voice input"}
              onClick={() => (voice.recording ? voice.stop() : voice.start())}
              className={voice.recording ? "bg-danger/12 text-danger" : undefined}
            >
              {voice.busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Mic className="h-[18px] w-[18px]" />}
            </IconToggle>
          )}
          {streaming ? (
            <button onClick={onStop} className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition hover:opacity-85" aria-label="Stop generating">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={(!text.trim() && !pending.some((p) => p.file)) || uploading}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-soft transition hover:brightness-110 disabled:from-line-strong disabled:to-line-strong disabled:text-subtle disabled:shadow-none"
              aria-label="Send"
            >
              <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
      {voice.error && <div className="px-5 pb-2 text-xs text-danger">{voice.error}</div>}
    </div>
  );
}

function IconToggle({ children, label, onClick, className }: { children: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg", className)}>
      {children}
    </button>
  );
}

function Pill({ children, active, onClick, label }: { children: React.ReactNode; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
