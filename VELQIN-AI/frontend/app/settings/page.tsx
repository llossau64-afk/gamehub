"use client";
import { Brain, Camera, Laptop, Moon, Palette, Shield, Smartphone, Sun, Trash2, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Card, Notice, Switch } from "@/components/ui/misc";
import { api, upload } from "@/lib/api";
import { useStore } from "@/lib/store";
import { readTheme, saveTheme, type Accent, type ThemeMode } from "@/lib/theme";
import type { User } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const TABS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Your data", icon: Trash2 },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <AppShell title="Settings">
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:py-10">
          <nav className="scroll-thin -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:w-52 md:shrink-0 md:flex-col md:px-0">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition", tab === t.id ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 space-y-6">
            {tab === "profile" && <Profile />}
            {tab === "appearance" && <Appearance />}
            {tab === "memory" && <MemorySettings />}
            {tab === "security" && <Security />}
            {tab === "data" && <DataSettings />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Profile() {
  const user = useStore((s) => s.user)!;
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState(user.display_name);
  const [v, setV] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  async function save() {
    const r = await api<{ user: User }>("/api/auth/me", { method: "PATCH", body: { display_name: name } });
    setUser(r.user);
    toast({ title: "Profile saved", tone: "success" });
  }
  async function avatar(f: File) {
    const form = new FormData();
    form.append("file", f);
    try {
      const r = await upload<{ user: User }>("/api/auth/avatar", form);
      setUser(r.user);
      setV(Date.now());
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, tone: "error" });
    }
  }
  return (
    <Section title="Profile">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar user={user} size={64} version={v} />
          <button onClick={() => input.current?.click()} className="absolute -bottom-1 -right-1 rounded-full border border-line bg-elevated p-1.5 text-muted shadow-soft hover:text-fg" aria-label="Change picture"><Camera className="h-3.5 w-3.5" /></button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar(f); e.target.value = ""; }} />
        </div>
        <div>
          <div className="font-medium">@{user.username}</div>
          <div className="text-sm text-muted">Role: {user.role} · Access group: VELQIN {user.effective_plan}</div>
        </div>
      </div>
      <div className="mt-6 flex items-end gap-2">
        <div className="flex-1"><Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field></div>
        <Button variant="primary" onClick={save} disabled={name === user.display_name}>Save</Button>
      </div>
    </Section>
  );
}

function Appearance() {
  const [t, setT] = useState(readTheme());
  const set = (mode: ThemeMode, accent: Accent) => {
    saveTheme(mode, accent);
    setT({ mode, accent });
  };
  const accents: { id: Accent; color: string }[] = [
    { id: "violet", color: "bg-[#8b7cf6]" }, { id: "blue", color: "bg-[#5b86ff]" }, { id: "silver", color: "bg-[#aeb3c4]" }, { id: "emerald", color: "bg-[#2fbf8f]" },
  ];
  return (
    <Section title="Appearance" description="Saved on this device.">
      <div className="grid grid-cols-3 gap-3">
        {([["system", Laptop, "System"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]] as const).map(([m, Icon, label]) => (
          <button key={m} onClick={() => set(m, t.accent)} className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm transition", t.mode === m ? "border-accent bg-accent-soft/50" : "border-line hover:border-line-strong")}>
            <Icon className="h-5 w-5" />{label}
          </button>
        ))}
      </div>
      <div className="mt-6 text-[13px] font-medium text-muted">Accent color</div>
      <div className="mt-2 flex gap-3">
        {accents.map((a) => (
          <button key={a.id} onClick={() => set(t.mode, a.id)} className={cn("flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm capitalize", t.accent === a.id ? "border-accent" : "border-line")}>
            <span className={cn("h-5 w-5 rounded-full", a.color)} />{a.id}
          </button>
        ))}
      </div>
    </Section>
  );
}

type Mem = { id: string; content: string; created_at: string };
function MemorySettings() {
  const user = useStore((s) => s.user)!;
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const [mems, setMems] = useState<Mem[]>([]);
  const [text, setText] = useState("");
  useEffect(() => {
    api<{ memories: Mem[] }>("/api/memory").then((r) => setMems(r.memories)).catch(() => {});
  }, []);
  async function toggle(v: boolean) {
    const r = await api<{ user: User }>("/api/auth/me", { method: "PATCH", body: { memory_enabled: v } });
    setUser(r.user);
  }
  async function add() {
    try {
      const r = await api<{ memory: Mem }>("/api/memory", { body: { content: text } });
      setMems([r.memory, ...mems]);
      setText("");
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, tone: "error" });
    }
  }
  async function del(id: string) {
    await api(`/api/memory/${id}`, { method: "DELETE" });
    setMems(mems.filter((m) => m.id !== id));
  }
  return (
    <Section title="VELQIN Memory" description="Long-term facts and preferences VELQIN includes in every chat — only when enabled. Stored only on your server, visible only to you.">
      <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
        <div><div className="text-sm font-medium">Use memory in chats</div><div className="text-xs text-subtle">You can also save any of your messages with the bookmark icon.</div></div>
        <Switch checked={user.memory_enabled} onChange={toggle} />
      </div>
      <div className="mt-4 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="e.g. I prefer short answers in German. I develop games in Godot." onKeyDown={(e) => e.key === "Enter" && text.trim() && add()} />
        <Button variant="secondary" onClick={add} disabled={!text.trim()}>Add</Button>
      </div>
      <div className="mt-4 space-y-2">
        {mems.length === 0 && <p className="text-sm text-subtle">No memories saved.</p>}
        {mems.map((m) => (
          <div key={m.id} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
            <span className="flex-1">{m.content}</span>
            <button onClick={() => del(m.id)} className="text-subtle hover:text-danger" aria-label="Delete memory"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Section>
  );
}

type Sess = { id: string; user_agent: string; ip: string; current: boolean; last_used_at: string };
function Security() {
  const toast = useStore((s) => s.toast);
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [sessions, setSessions] = useState<Sess[]>([]);
  const load = () => api<{ sessions: Sess[] }>("/api/auth/sessions").then((r) => setSessions(r.sessions)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  async function change() {
    if (pw.new_password !== pw.confirm) return toast({ title: "Passwords don't match", tone: "error" });
    try {
      await api("/api/auth/password", { body: { current_password: pw.current_password, new_password: pw.new_password } });
      setPw({ current_password: "", new_password: "", confirm: "" });
      toast({ title: "Password changed — other devices were signed out", tone: "success" });
      load();
    } catch (e) {
      toast({ title: "Password not changed", description: (e as Error).message, tone: "error" });
    }
  }
  const device = (ua: string) => (/iphone|android|mobile/i.test(ua) ? Smartphone : Laptop);
  return (
    <>
      <Section title="Change password">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Current"><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New"><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Field label="Confirm"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <Button className="mt-4" variant="primary" onClick={change} disabled={!pw.current_password || pw.new_password.length < 8}>Change password</Button>
      </Section>
      <Section title="Signed-in devices">
        <div className="space-y-2">
          {sessions.map((s) => {
            const Icon = device(s.user_agent);
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <Icon className="h-4 w-4 text-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{s.user_agent || "Unknown device"}</div>
                  <div className="text-xs text-subtle">{s.ip} · active {timeAgo(s.last_used_at)}</div>
                </div>
                {s.current ? <span className="text-xs text-success">This device</span> : (
                  <Button size="sm" variant="ghost" onClick={() => api(`/api/auth/sessions/${s.id}`, { method: "DELETE" }).then(load)}>Sign out</Button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function DataSettings() {
  const user = useStore((s) => s.user)!;
  const setUser = useStore((s) => s.setUser);
  const toast = useStore((s) => s.toast);
  const router = useRouter();
  const [open, setOpen] = useState<"data" | "account" | null>(null);
  const [password, setPassword] = useState("");
  async function run() {
    try {
      const r = await api<{ account_deleted: boolean }>("/api/auth/delete-data", { body: { password, delete_account: open === "account" } });
      setOpen(null);
      setPassword("");
      if (r.account_deleted) {
        setUser(null);
        router.replace("/login/");
      } else {
        toast({ title: "All your chats, files and media were deleted", tone: "success" });
        useStore.getState().loadChats();
      }
    } catch (e) {
      toast({ title: "Not deleted", description: (e as Error).message, tone: "error" });
    }
  }
  return (
    <Section title="Your data" description="Everything is stored only on this VELQIN server. Admins can't read your chats, files or prompts.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line px-4 py-3">
          <div className="flex-1"><div className="text-sm font-medium">Delete all my data</div><div className="text-xs text-subtle">Chats, files, images, videos, projects and memories. Your account stays.</div></div>
          <Button variant="outline" onClick={() => setOpen("data")}>Delete data</Button>
        </div>
        {user.role !== "owner" && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 px-4 py-3">
            <div className="flex-1"><div className="text-sm font-medium text-danger">Delete my account</div><div className="text-xs text-subtle">Removes your account and all data permanently.</div></div>
            <Button variant="danger" onClick={() => setOpen("account")}>Delete account</Button>
          </div>
        )}
      </div>
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open === "account" ? "Delete your account?" : "Delete all your data?"} description="This can't be undone. Enter your password to confirm."
        footer={<><Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button><Button variant="danger" onClick={run} disabled={!password}>Delete permanently</Button></>}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
        <Notice tone="danger" className="mt-3">Generated media files are removed from the server's disk as well.</Notice>
      </Dialog>
    </Section>
  );
}
