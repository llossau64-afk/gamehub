"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, CSRF } from "@/lib/api";
import { readSSE } from "@/lib/sse";
import { useStore } from "@/lib/store";
import type { AttachmentInfo, ChatSummary, Message } from "@/lib/types";

export type SendOptions = {
  content: string;
  attachments?: AttachmentInfo[];
  model: string;
  webSearch: boolean;
  think: boolean;
  mode?: "send" | "edit" | "regenerate";
  messageId?: string;
};

type Live = { messageId: string; lastId: number; done: boolean };

/**
 * Chat state + streaming. Generations keep running on the server even if the connection drops;
 * this hook re-attaches automatically (`/api/generations/{id}/stream?offset=n`) with backoff.
 */
export function useChat(chatId: string | null, onChatCreated: (c: ChatSummary) => void) {
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const live = useRef<Live | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef<{ content: string; thinking: string }>({ content: "", thinking: "" });
  const raf = useRef<number | null>(null);
  const skipLoad = useRef<string | null>(null);
  const toast = useStore((s) => s.toast);
  const upsertChat = useStore((s) => s.upsertChat);

  const patchMsg = useCallback((id: string, fn: (m: Message) => Message) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const flush = useCallback(() => {
    raf.current = null;
    const l = live.current;
    if (!l) return;
    const { content, thinking } = pending.current;
    if (!content && !thinking) return;
    pending.current = { content: "", thinking: "" };
    patchMsg(l.messageId, (m) => ({ ...m, content: m.content + content, thinking: m.thinking + thinking, statusText: content ? undefined : m.statusText }));
  }, [patchMsg]);

  const handleEvent = useCallback(
    (id: number | undefined, ev: any) => {
      const l = live.current;
      if (id !== undefined && l) l.lastId = Math.max(l.lastId, id);
      switch (ev.type) {
        case "start": {
          const user: Message = ev.user_message;
          const asst: Message = { ...ev.assistant_message, statusText: "Starting…" };
          live.current = { messageId: asst.id, lastId: 0, done: false };
          setStreamingId(asst.id);
          setMessages((ms) => {
            const idx = ms.findIndex((m) => m.id === user.id);
            const base = idx >= 0 ? ms.slice(0, idx) : ms.filter((m) => !m.id.startsWith("tmp-"));
            const prevUser = idx >= 0 ? ms[idx] : ms.find((m) => m.id.startsWith("tmp-"));
            return [...base, { ...user, attachments: prevUser?.attachments ?? user.attachments }, asst];
          });
          break;
        }
        case "meta":
          if (l) patchMsg(l.messageId, (m) => ({ ...m, model_profile: ev.profile, model_tag: ev.model_tag, meta: { ...m.meta, profile_name: ev.profile_name, routed: ev.routed } }));
          break;
        case "status":
          if (l) patchMsg(l.messageId, (m) => ({ ...m, statusText: ev.message }));
          break;
        case "sources":
          if (l) patchMsg(l.messageId, (m) => ({ ...m, meta: { ...m.meta, sources: ev.sources } }));
          break;
        case "thinking":
          pending.current.thinking += ev.content;
          if (raf.current == null) raf.current = requestAnimationFrame(flush);
          break;
        case "token":
          pending.current.content += ev.content;
          if (raf.current == null) raf.current = requestAnimationFrame(flush);
          break;
        case "done": {
          flush();
          const final: Message = ev.message;
          if (l) {
            l.done = true;
            patchMsg(l.messageId, (m) => ({ ...m, ...final, attachments: m.attachments, statusText: undefined }));
          }
          setStreamingId(null);
          break;
        }
        case "error":
          flush();
          if (l) {
            l.done = true;
            patchMsg(l.messageId, (m) => ({ ...m, status: "error", content: ev.partial ?? m.content, meta: { ...m.meta, error: ev.message }, statusText: undefined }));
          }
          setStreamingId(null);
          break;
        case "title":
          setChat((c) => {
            if (!c) return c;
            const next = { ...c, title: ev.title };
            upsertChat(next);
            return next;
          });
          break;
      }
    },
    [flush, patchMsg, upsertChat],
  );

  const resume = useCallback(async () => {
    const l = live.current;
    if (!l || l.done) return;
    setReconnecting(true);
    let delay = 800;
    for (let attempt = 0; attempt < 30 && !l.done && live.current === l; attempt++) {
      try {
        const ctl = new AbortController();
        abort.current = ctl;
        const res = await fetch(`/api/generations/${l.messageId}/stream?offset=${l.lastId}`, { credentials: "same-origin", signal: ctl.signal });
        if (res.status === 401 || res.status === 404) break;
        if (!res.ok) throw new Error(String(res.status));
        setReconnecting(false);
        await readSSE(res, (m) => handleEvent(m.id, m.data), ctl.signal);
        if (l.done) break;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
      setReconnecting(true);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.6, 8000);
    }
    setReconnecting(false);
    if (!l.done) setStreamingId(null);
  }, [handleEvent]);

  // load chat
  useEffect(() => {
    if (chatId && skipLoad.current === chatId) {
      // the chat was just created by send() — keep the running stream and local state
      skipLoad.current = null;
      return;
    }
    abort.current?.abort();
    live.current = null;
    setStreamingId(null);
    setNotFound(false);
    if (!chatId) {
      setChat(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<{ chat: ChatSummary; messages: Message[] }>(`/api/chats/${chatId}`)
      .then((r) => {
        if (cancelled) return;
        setChat(r.chat);
        const liveMsg = r.messages.find((m) => m.live);
        if (liveMsg) {
          // re-attach to a generation that is still running (e.g. after reload on the phone)
          setMessages(r.messages.map((m) => (m.id === liveMsg.id ? { ...m, content: "", thinking: "", statusText: "Reconnecting…" } : m)));
          live.current = { messageId: liveMsg.id, lastId: 0, done: false };
          setStreamingId(liveMsg.id);
          resume();
        } else setMessages(r.messages);
      })
      .catch((e) => {
        if (!cancelled && e instanceof ApiError && e.status === 404) setNotFound(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chatId, resume]);

  // reconnect when the device comes back online / app returns to foreground
  useEffect(() => {
    const kick = () => {
      if (live.current && !live.current.done && document.visibilityState === "visible") {
        abort.current?.abort();
        resume();
      }
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [resume]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (opts: SendOptions, projectId?: string | null) => {
      let id = chatId;
      let c = chat;
      if (!id) {
        const r = await api<{ chat: ChatSummary }>("/api/chats", { body: { model: opts.model, project_id: projectId || null } });
        c = r.chat;
        id = c.id;
        setChat(c);
        skipLoad.current = id;
        onChatCreated(c);
      }
      const mode = opts.mode ?? "send";
      if (mode === "send") {
        const tmp: Message = {
          id: `tmp-${Date.now()}`, chat_id: id!, seq: 1e9, role: "user", content: opts.content, thinking: "", status: "complete",
          model_profile: null, model_tag: null, meta: {}, attachment_ids: opts.attachments?.map((a) => a.id) ?? [],
          attachments: opts.attachments ?? [], created_at: new Date().toISOString(),
        };
        setMessages((ms) => [...ms, tmp]);
      } else if (mode === "regenerate") {
        setMessages((ms) => {
          const lastUser = [...ms].reverse().find((m) => m.role === "user");
          return lastUser ? ms.filter((m) => m.seq <= lastUser.seq) : ms;
        });
      } else if (mode === "edit") {
        setMessages((ms) => {
          const target = ms.find((m) => m.id === opts.messageId);
          return target ? ms.filter((m) => m.seq <= target.seq).map((m) => (m.id === target.id ? { ...m, content: opts.content } : m)) : ms;
        });
      }

      const ctl = new AbortController();
      abort.current = ctl;
      let res: Response;
      try {
        res = await fetch(`/api/chats/${id}/messages`, {
          method: "POST",
          credentials: "same-origin",
          signal: ctl.signal,
          headers: { "Content-Type": "application/json", ...CSRF },
          body: JSON.stringify({
            content: opts.content, model: opts.model, web_search: opts.webSearch, think: opts.think, mode,
            message_id: opts.messageId, attachment_ids: opts.attachments?.map((a) => a.id) ?? [],
          }),
        });
      } catch {
        setMessages((ms) => ms.filter((m) => !m.id.startsWith("tmp-")));
        toast({ title: "Message not sent", description: "Can't reach the VELQIN server.", tone: "error" });
        return false;
      }
      if (!res.ok) {
        let detail = `Error ${res.status}`;
        try {
          detail = (await res.json()).detail ?? detail;
        } catch {
          /* ignore */
        }
        setMessages((ms) => ms.filter((m) => !m.id.startsWith("tmp-")));
        toast({ title: "Message not sent", description: detail, tone: "error" });
        if (mode !== "send" && id) {
          const r = await api<{ chat: ChatSummary; messages: Message[] }>(`/api/chats/${id}`).catch(() => null);
          if (r) setMessages(r.messages);
        }
        return false;
      }
      if (c) upsertChat({ ...c, updated_at: new Date().toISOString() });
      try {
        await readSSE(res, (m) => handleEvent(m.id, m.data), ctl.signal);
      } catch (e) {
        if ((e as Error).name === "AbortError") return true;
      }
      if (live.current && !live.current.done) resume();
      return true;
    },
    [chatId, chat, onChatCreated, handleEvent, resume, toast, upsertChat],
  );

  const stop = useCallback(async () => {
    const l = live.current;
    if (!l) return;
    await api(`/api/generations/${l.messageId}/stop`, { method: "POST" }).catch(() => {});
  }, []);

  return { chat, setChat, messages, setMessages, loading, notFound, streamingId, reconnecting, send, stop };
}
