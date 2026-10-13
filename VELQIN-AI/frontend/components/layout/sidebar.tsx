"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Boxes, Clapperboard, FolderKanban, GalleryVerticalEnd, Image as ImageIcon, LogOut, MoreHorizontal, Pencil, Pin,
  PinOff, Plus, Search, Settings, Shield, Sparkles, SunMoon, Trash2,
} from "lucide-react";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { useStore, hasFeature } from "@/lib/store";
import { cn, groupByDate } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { readTheme, saveTheme } from "@/lib/theme";
import type { ChatSummary } from "@/lib/types";

const NAV = [
  { href: "/images/", label: "Images", icon: ImageIcon, feature: "image_generate" },
  { href: "/video/", label: "Video Studio", icon: Clapperboard, feature: "video" },
  { href: "/projects/", label: "Projects", icon: FolderKanban, feature: null },
  { href: "/library/", label: "Library", icon: GalleryVerticalEnd, feature: null },
  { href: "/models/", label: "Model Library", icon: Boxes, feature: null },
];

export function Sidebar() {
  return (
    <Suspense fallback={null}>
      <SidebarInner />
    </Suspense>
  );
}

function SidebarInner() {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const router = useRouter();
  const user = useStore((s) => s.user);
  const chats = useStore((s) => s.chats);
  const setPalette = useStore((s) => s.setPalette);
  const activeChat = pathname === "/" ? params.get("c") : null;
  const groups = groupByDate(chats.filter((c) => !c.project_id).concat(chats.filter((c) => c.project_id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <Link href="/" className="rounded-lg px-1 py-1" aria-label="VELQIN home">
          <Logo />
        </Link>
      </div>
      <div className="space-y-1 px-3">
        <button
          onClick={() => router.push(`/?new=${Date.now()}`)}
          className="group flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium shadow-soft transition hover:border-line-strong"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
            <Plus className="h-3.5 w-3.5" />
          </span>
          New chat
        </button>
        <button onClick={() => setPalette(true)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="hidden rounded-md border border-line px-1.5 text-[10px] text-subtle lg:inline">Ctrl K</kbd>
        </button>
        {NAV.filter((n) => !n.feature || hasFeature(user, n.feature) || n.feature === "video").map((n) => {
          const active = pathname.startsWith(n.href);
          const locked = n.feature && !hasFeature(user, n.feature);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {locked ? <span className="text-[10px] uppercase tracking-wide text-subtle">Creator</span> : null}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 px-5 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">Chats</div>
      <nav className="scroll-thin mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {chats.length === 0 ? (
          <p className="px-3 py-2 text-[13px] text-subtle">Your conversations will appear here.</p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-3 pb-1 pt-2 text-[11px] text-subtle">{g.label}</div>
              {g.items.map((c) => (
                <ChatRow key={c.id} chat={c} active={c.id === activeChat} />
              ))}
            </div>
          ))
        )}
      </nav>
      <div className="border-t border-line p-3 pb-safe">
        <UserMenu />
      </div>
    </div>
  );
}

function ChatRow({ chat, active }: { chat: ChatSummary; active: boolean }) {
  const router = useRouter();
  const upsert = useStore((s) => s.upsertChat);
  const remove = useStore((s) => s.removeChat);
  const toast = useStore((s) => s.toast);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    try {
      const r = await api<{ chat: ChatSummary }>(`/api/chats/${chat.id}`, { method: "PATCH", body: { title } });
      upsert(r.chat);
      setRenaming(false);
    } catch (e) {
      toast({ title: "Rename failed", description: (e as Error).message, tone: "error" });
    }
  }
  async function del() {
    try {
      await api(`/api/chats/${chat.id}`, { method: "DELETE" });
      remove(chat.id);
      setConfirm(false);
      if (active) router.push("/");
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, tone: "error" });
    }
  }
  async function pin() {
    const r = await api<{ chat: ChatSummary }>(`/api/chats/${chat.id}`, { method: "PATCH", body: { pinned: !chat.pinned } });
    upsert(r.chat);
  }

  return (
    <div className={cn("group relative flex items-center rounded-xl transition", active ? "bg-surface-2" : "hover:bg-surface-2/70")}>
      <Link href={`/?c=${chat.id}`} className={cn("min-w-0 flex-1 truncate px-3 py-2 text-[13.5px]", active ? "text-fg" : "text-muted group-hover:text-fg")}>
        {chat.pinned ? <Pin className="mr-1.5 inline h-3 w-3 text-subtle" /> : null}
        {chat.title}
      </Link>
      <Menu
        align="end"
        width={200}
        trigger={({ toggle, ref, open }) => (
          <button
            ref={ref}
            onClick={toggle}
            className={cn("mr-1 rounded-lg p-1.5 text-subtle hover:text-fg", open ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100")}
            aria-label="Chat options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={<Pencil />} onClick={() => { close(); setTitle(chat.title); setRenaming(true); }}>Rename</MenuItem>
            <MenuItem icon={chat.pinned ? <PinOff /> : <Pin />} onClick={() => { close(); pin(); }}>{chat.pinned ? "Unpin" : "Pin"}</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(true); }}>Delete</MenuItem>
          </>
        )}
      </Menu>
      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename chat"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!title.trim()}>Save</Button>
          </>
        }
      >
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && title.trim() && save()} />
      </Dialog>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={del} title="Delete this chat?" description="The conversation is permanently removed from this server." />
    </div>
  );
}

function UserMenu() {
  const user = useStore((s) => s.user)!;
  const setUser = useStore((s) => s.setUser);
  const router = useRouter();
  const [theme, setTheme] = useState(readTheme());
  const planName: Record<string, string> = { free: "Free", creator: "Creator", studio: "Studio", owner: "Owner" };

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.replace("/login/");
  }
  function cycleTheme() {
    const order = ["system", "dark", "light"] as const;
    const mode = order[(order.indexOf(theme.mode) + 1) % 3];
    saveTheme(mode, theme.accent);
    setTheme({ ...theme, mode });
  }

  return (
    <Menu
      side="top"
      width={256}
      trigger={({ toggle, ref }) => (
        <button ref={ref} onClick={toggle} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2">
          <Avatar user={user} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.display_name}</div>
            <div className="text-xs text-subtle">VELQIN {planName[user.effective_plan] ?? user.effective_plan}</div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-subtle" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<Settings />} onClick={() => { close(); router.push("/settings/"); }}>Settings</MenuItem>
          <MenuItem icon={<Sparkles />} onClick={() => { close(); router.push("/plans/"); }}>Plans</MenuItem>
          {user.features.includes("admin") && (
            <MenuItem icon={<Shield />} onClick={() => { close(); router.push("/admin/"); }}>Admin dashboard</MenuItem>
          )}
          <MenuItem icon={<SunMoon />} onClick={cycleTheme} hint={`Theme: ${theme.mode}`}>Switch theme</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<LogOut />} onClick={() => { close(); logout(); }}>Sign out</MenuItem>
        </>
      )}
    </Menu>
  );
}
