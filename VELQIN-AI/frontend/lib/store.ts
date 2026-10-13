"use client";
import { create } from "zustand";
import { api } from "./api";
import type { ChatSummary, ModelProfile, Project, User } from "./types";

type AuthState = "loading" | "authed" | "anon" | "setup";
type Toast = { id: number; title: string; description?: string; tone?: "default" | "error" | "success" };
type ServiceStatus = Record<string, { online: boolean; purpose: string }>;

type Store = {
  auth: AuthState;
  user: User | null;
  publicRegistration: boolean;
  models: ModelProfile[];
  runtimeOnline: boolean;
  chats: ChatSummary[];
  projects: Project[];
  sidebarOpen: boolean;
  paletteOpen: boolean;
  toasts: Toast[];
  services: ServiceStatus;
  gpuBusy: boolean;
  gpuJobKind: string | null;
  loadSession: () => Promise<void>;
  setUser: (u: User | null) => void;
  loadModels: () => Promise<void>;
  loadChats: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadStatus: () => Promise<void>;
  upsertChat: (c: ChatSummary) => void;
  removeChat: (id: string) => void;
  setSidebar: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
};

let toastId = 0;

export const useStore = create<Store>((set, get) => ({
  auth: "loading",
  user: null,
  publicRegistration: false,
  models: [],
  runtimeOnline: true,
  chats: [],
  projects: [],
  sidebarOpen: false,
  paletteOpen: false,
  toasts: [],
  services: {},
  gpuBusy: false,
  gpuJobKind: null,

  async loadSession() {
    try {
      const st = await api<{ needs_setup: boolean; public_registration: boolean }>("/api/auth/status");
      set({ publicRegistration: st.public_registration });
      if (st.needs_setup) return set({ auth: "setup", user: null });
      const me = await api<{ user: User }>("/api/auth/me");
      set({ auth: "authed", user: me.user });
    } catch {
      set({ auth: "anon", user: null });
    }
  },
  setUser(u) {
    set({ user: u, auth: u ? "authed" : "anon" });
  },
  async loadModels() {
    try {
      const r = await api<{ runtime_online: boolean; profiles: ModelProfile[] }>("/api/models");
      set({ models: r.profiles, runtimeOnline: r.runtime_online });
    } catch {
      /* handled by status */
    }
  },
  async loadChats() {
    try {
      const r = await api<{ chats: ChatSummary[] }>("/api/chats");
      set({ chats: r.chats });
    } catch {
      /* ignore */
    }
  },
  async loadProjects() {
    try {
      const r = await api<{ projects: Project[] }>("/api/projects");
      set({ projects: r.projects });
    } catch {
      /* ignore */
    }
  },
  async loadStatus() {
    try {
      const r = await api<{ services: ServiceStatus; gpu_busy: boolean; gpu_job_kind: string | null }>("/api/system/status");
      set({ services: r.services, gpuBusy: r.gpu_busy, gpuJobKind: r.gpu_job_kind });
    } catch {
      /* ignore */
    }
  },
  upsertChat(c) {
    const others = get().chats.filter((x) => x.id !== c.id);
    set({ chats: [c, ...others].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)) });
  },
  removeChat(id) {
    set({ chats: get().chats.filter((c) => c.id !== id) });
  },
  setSidebar(open) {
    set({ sidebarOpen: open });
  },
  setPalette(open) {
    set({ paletteOpen: open });
  },
  toast(t) {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismissToast(id), t.tone === "error" ? 6000 : 3500);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const hasFeature = (u: User | null, f: string) => !!u && (u.features.includes(f));
