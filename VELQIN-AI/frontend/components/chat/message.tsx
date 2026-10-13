"use client";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle, Bookmark, Brain, Check, ChevronDown, Copy, Cpu, Eye, FileText, Globe, Pencil, RefreshCw, Volume2, VolumeX,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Message as Msg, Source } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo";
import { Markdown } from "./markdown";

export const MessageView = memo(function MessageView({
  msg, isLast, streaming, onRegenerate, onEdit,
}: { msg: Msg; isLast: boolean; streaming: boolean; onRegenerate: () => void; onEdit: (id: string, content: string) => void }) {
  return msg.role === "user" ? <UserMessage msg={msg} onEdit={onEdit} disabled={streaming} /> : <AssistantMessage msg={msg} isLast={isLast} streaming={streaming} onRegenerate={onRegenerate} />;
});

function UserMessage({ msg, onEdit, disabled }: { msg: Msg; onEdit: (id: string, c: string) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const toast = useStore((s) => s.toast);
  const images = msg.attachments?.filter((a) => a.kind === "image") ?? [];
  const docs = msg.attachments?.filter((a) => a.kind === "document") ?? [];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="group flex flex-col items-end gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((a) => (
            <a key={a.id} href={`/api/files/${a.id}/content`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${a.id}/content`} alt={a.filename} className="h-32 max-w-[220px] rounded-2xl border border-line object-cover" />
            </a>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {docs.map((a) => (
            <a key={a.id} href={`/api/files/${a.id}/content?download=true`} className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-xs hover:border-line-strong">
              <FileText className="h-4 w-4 text-accent" />
              <span className="max-w-[180px] truncate">{a.filename}</span>
            </a>
          ))}
        </div>
      )}
      {editing ? (
        <div className="w-full max-w-[85%] rounded-3xl border border-line-strong bg-surface p-3">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(10, draft.split("\n").length + 1)} className="w-full resize-none bg-transparent text-[15px] outline-none" autoFocus />
          <div className="mt-2 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-2" onClick={() => setEditing(false)}>Cancel</button>
            <button className="rounded-xl bg-fg px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40" disabled={!draft.trim()} onClick={() => { setEditing(false); onEdit(msg.id, draft.trim()); }}>Send</button>
          </div>
        </div>
      ) : (
        msg.content && msg.content !== "(see attached files)" && (
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed">{msg.content}</div>
        )
      )}
      {!editing && !msg.id.startsWith("tmp-") && (
        <div className="flex gap-0.5 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
          <Action label="Copy" onClick={() => navigator.clipboard?.writeText(msg.content)}><Copy /></Action>
          {!disabled && <Action label="Edit" onClick={() => { setDraft(msg.content); setEditing(true); }}><Pencil /></Action>}
          <Action
            label="Remember this (VELQIN Memory)"
            onClick={() => api(`/api/messages/${msg.id}/remember`, { method: "POST" }).then(() => toast({ title: "Saved to memory", tone: "success" })).catch((e) => toast({ title: "Could not save", description: e.message, tone: "error" }))}
          >
            <Bookmark />
          </Action>
        </div>
      )}
    </motion.div>
  );
}

function KnowledgeBadges({ msg }: { msg: Msg }) {
  const k = msg.meta.knowledge ?? [];
  const web = (msg.meta.sources ?? []).filter((s) => s.kind === "web").length;
  const files = (msg.meta.sources ?? []).filter((s) => s.kind === "file").length;
  const items: { icon: React.ReactNode; label: string; tone: string }[] = [];
  if (k.includes("web")) items.push({ icon: <Globe />, label: `Web research · ${web} source${web === 1 ? "" : "s"}`, tone: "text-accent bg-accent-soft" });
  if (k.includes("file")) items.push({ icon: <FileText />, label: `From your files${files ? ` · ${files}` : ""}`, tone: "text-success bg-success/10" });
  if (k.includes("image")) items.push({ icon: <Eye />, label: "Image analysis", tone: "text-accent-2 bg-accent-2/10" });
  if (msg.status !== "streaming" && k.length && !k.includes("web") && !k.includes("file")) items.push({ icon: <Brain />, label: "Model knowledge", tone: "text-muted bg-surface-2" });
  if (msg.meta.cpu_fallback) items.push({ icon: <Cpu />, label: "Ran on CPU (GPU busy)", tone: "text-warning bg-warning/10" });
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i.label} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium [&_svg]:h-3 [&_svg]:w-3", i.tone)}>
          {i.icon}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const web = sources.filter((s) => s.kind === "web");
  const [open, setOpen] = useState(false);
  if (!web.length) return null;
  const shown = open ? web : web.slice(0, 4);
  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((s) => (
          <a key={String(s.index)} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 transition hover:border-line-strong">
            <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-accent-soft px-1 text-[10.5px] font-semibold text-accent">{s.index}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium group-hover:text-accent">{s.title}</span>
              <span className="block truncate text-[11.5px] text-subtle">
                {s.domain}
                {s.published ? ` · ${s.published}` : ""}
                {s.fetched === false ? " · snippet only" : ""}
              </span>
            </span>
          </a>
        ))}
      </div>
      {web.length > 4 && (
        <button className="mt-2 text-xs text-muted hover:text-fg" onClick={() => setOpen(!open)}>{open ? "Show fewer sources" : `Show all ${web.length} sources`}</button>
      )}
    </div>
  );
}

function AssistantMessage({ msg, isLast, streaming, onRegenerate }: { msg: Msg; isLast: boolean; streaming: boolean; onRegenerate: () => void }) {
  const [showThinking, setShowThinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const isStreaming = msg.status === "streaming";
  const waiting = isStreaming && !msg.content;

  useEffect(() => () => { if (speaking) window.speechSynthesis?.cancel(); }, [speaking]);

  function speak() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const plain = msg.content.replace(/```[\s\S]*?```/g, " (code) ").replace(/[#*_`>|[\]()]/g, "").slice(0, 6000);
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = /[äöüß]|\b(und|der|die|das|ist|nicht)\b/i.test(plain) ? "de-DE" : "en-US";
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="group flex gap-3 sm:gap-4">
      <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface sm:flex">
        <LogoMark size={18} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
          <span className="font-medium text-muted">{msg.meta.profile_name ?? "VELQIN"}</span>
          {msg.meta.routed && msg.meta.routed !== "manual" ? <span>· Auto</span> : null}
        </div>
        <KnowledgeBadges msg={msg} />
        {msg.thinking ? (
          <div className="rounded-2xl border border-line bg-surface/60">
            <button className="flex w-full items-center gap-2 px-3.5 py-2 text-[13px] text-muted" onClick={() => setShowThinking(!showThinking)}>
              <Brain className="h-3.5 w-3.5" />
              <span className={cn(isStreaming && !msg.content && "shimmer")}>{isStreaming && !msg.content ? "Reasoning…" : "Reasoning"}</span>
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition", showThinking && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {showThinking && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="whitespace-pre-wrap border-t border-line px-3.5 py-3 text-[13px] leading-relaxed text-muted">{msg.thinking}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
        {waiting && !msg.thinking ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <span className="shimmer">{msg.statusText ?? "Thinking…"}</span>
          </div>
        ) : null}
        {msg.statusText && !waiting && isStreaming ? <div className="text-xs text-subtle">{msg.statusText}</div> : null}
        {msg.content ? <div className={cn(isStreaming && "streaming-md")}><Markdown text={msg.content} sources={msg.meta.sources} /></div> : null}
        {msg.status === "error" && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-danger/25 bg-danger/8 px-3.5 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <div className="text-fg">{msg.meta.error ?? "Something went wrong."}</div>
              {isLast && !streaming && <button className="mt-1.5 text-[13px] font-medium text-accent hover:underline" onClick={onRegenerate}>Try again</button>}
            </div>
          </div>
        )}
        {msg.status === "stopped" && <div className="text-xs text-subtle">Stopped.</div>}
        {msg.status === "interrupted" && <div className="text-xs text-warning">The server restarted while answering — the answer may be incomplete.</div>}
        {msg.meta.web_error && msg.status !== "streaming" && <div className="text-xs text-warning">Web search: {msg.meta.web_error}</div>}
        {msg.meta.sources && <Sources sources={msg.meta.sources} />}
        {!isStreaming && msg.content && (
          <div className="flex items-center gap-0.5 text-subtle">
            <Action label={copied ? "Copied" : "Copy"} onClick={() => navigator.clipboard?.writeText(msg.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? <Check /> : <Copy />}
            </Action>
            {isLast && !streaming && <Action label="Regenerate" onClick={onRegenerate}><RefreshCw /></Action>}
            {typeof window !== "undefined" && "speechSynthesis" in window && <Action label={speaking ? "Stop reading" : "Read aloud (device voice)"} onClick={speak}>{speaking ? <VolumeX /> : <Volume2 />}</Action>}
            {msg.meta.tokens_per_s ? (
              <span className="ml-2 text-[11px] opacity-0 transition group-hover:opacity-100" title={msg.model_tag ?? ""}>
                {msg.model_tag} · {msg.meta.tokens} tokens · {msg.meta.tokens_per_s} tok/s
              </span>
            ) : null}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Action({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="rounded-lg p-1.5 text-subtle transition hover:bg-surface-2 hover:text-fg [&_svg]:h-[15px] [&_svg]:w-[15px]">
      {children}
    </button>
  );
}
