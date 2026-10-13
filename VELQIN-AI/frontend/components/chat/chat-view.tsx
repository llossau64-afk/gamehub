"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Clapperboard, Code2, FolderKanban, Globe, Image as ImageIcon, Lightbulb, MoreHorizontal, PenLine, Trash2, WifiOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import { LogoMark } from "@/components/ui/logo";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { EmptyState, Notice } from "@/components/ui/misc";
import { useChat } from "@/hooks/use-chat";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { ChatSummary, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageView } from "./message";

const SUGGESTIONS = [
  { icon: Lightbulb, label: "Plan a racing game", prompt: "Help me plan a small racing game: core loop, art style, levels and a 4-week roadmap." },
  { icon: Globe, label: "What's new today?", prompt: "What are today's most important news headlines?", web: true },
  { icon: Code2, label: "Explain some code", prompt: "Explain what this code does and how to improve it:\n\n```python\n\n```" },
  { icon: PenLine, label: "Write something", prompt: "Write a short, catchy description for my YouTube channel about gaming." },
  { icon: ImageIcon, label: "Generate an image", href: "/images/" },
  { icon: Clapperboard, label: "Create a video", href: "/video/" },
];

export function ChatView() {
  const params = useSearchParams();
  const router = useRouter();
  const chatId = params.get("c");
  const newKey = params.get("new");
  const projectParam = params.get("project");
  const user = useStore((s) => s.user);
  const runtimeOnline = useStore((s) => s.runtimeOnline);
  const models = useStore((s) => s.models);
  const upsertChat = useStore((s) => s.upsertChat);
  const removeChat = useStore((s) => s.removeChat);
  const projects = useStore((s) => s.projects);
  const loadProjects = useStore((s) => s.loadProjects);
  const toast = useStore((s) => s.toast);

  const [model, setModel] = useState<string>(user?.prefs?.default_model ?? "auto");
  const [webSearch, setWebSearch] = useState(false);
  const [think, setThink] = useState(false);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onCreated = useCallback(
    (c: ChatSummary) => {
      upsertChat(c);
      router.replace(`/?c=${c.id}`, { scroll: false });
    },
    [router, upsertChat],
  );
  const { chat, setChat, messages, loading, notFound, streamingId, reconnecting, send, stop } = useChat(chatId, onCreated);
  const projectId = chat?.project_id ?? projectParam;
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (chat?.model) setModel(chat.model);
  }, [chat?.id, chat?.model]);
  useEffect(() => {
    setDraft(undefined);
    setWebSearch(false);
  }, [newKey]);

  // ---- scrolling -------------------------------------------------------------------------
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const stick = useRef(true);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    setAtBottom(near);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    stick.current = true;
    requestAnimationFrame(() => scroller.current && (scroller.current.scrollTop = scroller.current.scrollHeight));
  }, [chatId]);

  const streaming = !!streamingId;
  const submit = (p: { content: string; attachments: any[] }) => {
    stick.current = true;
    return send({ content: p.content, attachments: p.attachments, model, webSearch, think }, projectId);
  };
  const regenerate = () => send({ content: "", model, webSearch: !!messages[messages.length - 1]?.meta?.knowledge?.includes("web") || webSearch, think, mode: "regenerate" });
  const edit = (id: string, content: string) => send({ content, model, webSearch, think, mode: "edit", messageId: id });

  async function moveToProject(pid: string | null) {
    if (!chat) return;
    const r = await api<{ chat: ChatSummary }>(`/api/chats/${chat.id}`, { method: "PATCH", body: pid ? { project_id: pid } : { clear_project: true } });
    setChat(r.chat);
    upsertChat(r.chat);
    toast({ title: pid ? "Moved to project" : "Removed from project", tone: "success" });
  }
  async function deleteChat() {
    if (!chat) return;
    await api(`/api/chats/${chat.id}`, { method: "DELETE" });
    removeChat(chat.id);
    setConfirmDelete(false);
    router.push("/");
  }

  const empty = !chatId && messages.length === 0;
  const composer = (
    <Composer
      onSubmit={submit}
      onStop={stop}
      streaming={streaming}
      model={model}
      setModel={setModel}
      webSearch={webSearch}
      setWebSearch={setWebSearch}
      think={think}
      setThink={setThink}
      autoFocus
      projectId={projectId}
      initialText={draft}
      placeholder={project ? `Ask about ${project.name}…` : undefined}
    />
  );
  const noModels = runtimeOnline && models.length > 0 && !models.some((m) => m.installed);

  return (
    <AppShell
      bare={empty}
      title={
        chat ? (
          <span className="flex items-center gap-2">
            {project && <span className="hidden items-center gap-1 rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted sm:inline-flex"><FolderKanban className="h-3 w-3" />{project.name}</span>}
            <span className="truncate">{chat.title}</span>
          </span>
        ) : null
      }
      actions={
        chat ? (
          <Menu
            align="end"
            width={240}
            trigger={({ toggle, ref }) => (
              <button ref={ref} onClick={toggle} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Chat options">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-subtle">Move to project</div>
                {projects.length === 0 && <div className="px-2.5 py-1.5 text-xs text-subtle">No projects yet.</div>}
                {projects.map((p) => (
                  <MenuItem key={p.id} icon={<FolderKanban />} active={p.id === chat.project_id} onClick={() => { close(); moveToProject(p.id); }}>{p.name}</MenuItem>
                ))}
                {chat.project_id && <MenuItem onClick={() => { close(); moveToProject(null); }}>Remove from project</MenuItem>}
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirmDelete(true); }}>Delete chat</MenuItem>
              </>
            )}
          </Menu>
        ) : null
      }
    >
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={deleteChat} title="Delete this chat?" description="This conversation is permanently removed." />
      {empty ? (
        <div className="ambient relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-[760px]">
            <div className="mb-8 flex flex-col items-center text-center">
              <LogoMark size={44} className="mb-6" />
              <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.6rem]">
                <span className="text-brand">Welcome to VELQIN.</span>
              </h1>
              <p className="mt-3 text-[15px] text-muted sm:text-lg">What would you like to create today?</p>
              {project && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted"><FolderKanban className="h-3.5 w-3.5" /> New chat in {project.name}</p>}
            </div>
            {!runtimeOnline && <Notice tone="warning" className="mb-4" title="The local AI runtime is offline">Start Ollama on the VELQIN server (it starts automatically with <code>start-velqin.bat</code>). Chats will work again as soon as it is running.</Notice>}
            {noModels && <Notice tone="info" className="mb-4" title="No model installed yet">Open the <a className="text-accent underline" href="/models/">Model Library</a> and download VELQIN Swift (qwen3:4b) to start chatting.</Notice>}
            {composer}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  onClick={() => {
                    if (s.href) router.push(s.href);
                    else {
                      setDraft(s.prompt);
                      if (s.web) setWebSearch(true);
                    }
                  }}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-2 text-[13px] text-muted transition hover:border-line-strong hover:text-fg"
                >
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                </motion.button>
              ))}
            </div>
            <p className="mt-8 text-center text-[11.5px] text-subtle">Runs entirely on your own server. VELQIN can make mistakes — check important information.</p>
          </motion.div>
        </div>
      ) : notFound ? (
        <EmptyState title="Chat not found">This chat doesn't exist or belongs to someone else.</EmptyState>
      ) : (
        <>
          <div ref={scroller} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-[780px] space-y-8 px-4 pb-10 pt-6 sm:px-6">
              {loading && messages.length === 0 ? (
                <div className="space-y-6">
                  {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />)}
                </div>
              ) : (
                messages.map((m, i) => (
                  <MessageView key={m.id} msg={m} isLast={i === messages.length - 1} streaming={streaming} onRegenerate={regenerate} onEdit={edit} />
                ))
              )}
            </div>
          </div>
          <AnimatePresence>
            {!atBottom && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={() => { stick.current = true; scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }}
                className="absolute bottom-36 left-1/2 z-20 -translate-x-1/2 rounded-full border border-line bg-elevated p-2 text-muted shadow-float hover:text-fg"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
          <div className="pb-safe shrink-0 bg-gradient-to-t from-bg via-bg to-transparent px-3 pt-2 sm:px-6">
            <div className="mx-auto w-full max-w-[780px]">
              {reconnecting && (
                <div className="mb-2 flex items-center justify-center gap-2 text-xs text-warning"><WifiOff className="h-3.5 w-3.5" /> Connection lost — reconnecting. The answer keeps generating on the server.</div>
              )}
              {composer}
              <p className={cn("mt-2 hidden text-center text-[11px] text-subtle sm:block")}>VELQIN runs locally on your server and can make mistakes.</p>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
