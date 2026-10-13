"use client";
import { Activity, Archive, Check, Copy, Cpu, Database, Download, HardDrive, KeyRound, ListChecks, MemoryStick, Plus, ScrollText, Server, Settings2, Shield, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card, EmptyState, Notice, Progress, Skeleton, StatusDot, Switch } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Job } from "@/lib/types";
import { cn, formatBytes, formatDuration, timeAgo } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "users", label: "Users", icon: Users },
  { id: "invites", label: "Invites", icon: KeyRound },
  { id: "jobs", label: "Jobs", icon: ListChecks },
  { id: "settings", label: "System", icon: Settings2 },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "backups", label: "Backups", icon: Archive },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const user = useStore((s) => s.user)!;
  const [tab, setTab] = useState<Tab>("overview");
  if (!user.features.includes("admin")) return <AppShell title="Admin"><EmptyState icon={<Shield className="h-5 w-5" />} title="Admins only" /></AppShell>;
  return (
    <AppShell title={<span className="flex items-center gap-2"><Shield className="h-4 w-4 text-accent" />Admin dashboard</span>}>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="scroll-thin -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition", tab === t.id ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            ))}
          </div>
          {tab === "overview" && <Overview />}
          {tab === "users" && <UsersTab />}
          {tab === "invites" && <InvitesTab />}
          {tab === "jobs" && <JobsTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "logs" && <LogsTab />}
          {tab === "backups" && <BackupsTab />}
        </div>
      </div>
    </AppShell>
  );
}

type Overview = {
  users: { total: number; active_15min: number; active_24h: number };
  jobs: { queued: number; running: Job[]; failed_24h: number };
  chat: { live_generations: number; chats: number; messages: number };
  library: { images: number; videos: number; files: number };
  models: { runtime_online: boolean; installed: number };
  services: Record<string, { online: boolean; purpose: string; version?: string }>;
  system: SystemStats;
};
type SystemStats = {
  cpu_percent: number; cpu_count: number; ram_used_mb: number; ram_total_mb: number; disk_used_gb: number; disk_total_gb: number; disk_free_gb: number;
  gpus: { name: string; util_percent: number; vram_used_mb: number; vram_total_mb: number; temperature_c: number | null }[];
  gpu_busy: boolean; gpu_lease: { kind: string; seconds: number } | null; last_oom_at: number | null;
};

const SERVICE_NAMES: Record<string, string> = { ollama: "Ollama", comfyui: "ComfyUI", searxng: "SearXNG", ffmpeg: "FFmpeg", whisper: "Whisper (voice)" };

function Stat({ icon, label, value, sub, children }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}

function Overview() {
  const [o, setO] = useState<Overview | null>(null);
  const [sys, setSys] = useState<SystemStats | null>(null);
  useEffect(() => {
    api<Overview>("/api/admin/overview").then((r) => { setO(r); setSys(r.system); }).catch(() => {});
    const t = setInterval(() => api<SystemStats>("/api/admin/stats").then(setSys).catch(() => {}), 3000);
    const t2 = setInterval(() => api<Overview>("/api/admin/overview").then(setO).catch(() => {}), 15000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, []);
  if (!o || !sys) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>;
  const gpu = sys.gpus[0];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users />} label="Active users" value={o.users.active_15min} sub={`${o.users.active_24h} today · ${o.users.total} accounts`} />
        <Stat icon={<ListChecks />} label="Generation queue" value={o.jobs.queued} sub={`${o.jobs.running.length} running · ${o.jobs.failed_24h} failed (24 h)`} />
        <Stat icon={<Activity />} label="Live chat answers" value={o.chat.live_generations} sub={`${o.chat.chats} chats · ${o.chat.messages} messages`} />
        <Stat icon={<Database />} label="Library" value={o.library.images + o.library.videos} sub={`${o.library.images} images · ${o.library.videos} videos · ${o.library.files} files`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <Stat icon={<Cpu />} label="GPU" value={gpu ? `${gpu.util_percent}%` : "—"} sub={gpu ? `${gpu.name}${gpu.temperature_c != null ? ` · ${gpu.temperature_c}°C` : ""}` : "No NVIDIA GPU detected"}>
          {gpu && <Progress value={gpu.util_percent / 100} />}
        </Stat>
        <Stat icon={<MemoryStick />} label="VRAM" value={gpu ? `${(gpu.vram_used_mb / 1024).toFixed(1)} GB` : "—"} sub={gpu ? `of ${(gpu.vram_total_mb / 1024).toFixed(1)} GB` : undefined}>
          {gpu && <Progress value={gpu.vram_used_mb / gpu.vram_total_mb} />}
        </Stat>
        <Stat icon={<MemoryStick />} label="RAM" value={`${(sys.ram_used_mb / 1024).toFixed(1)} GB`} sub={`of ${(sys.ram_total_mb / 1024).toFixed(1)} GB · CPU ${sys.cpu_percent.toFixed(0)}% (${sys.cpu_count} threads)`}>
          <Progress value={sys.ram_used_mb / sys.ram_total_mb} />
        </Stat>
        <Stat icon={<HardDrive />} label="Storage" value={`${sys.disk_free_gb} GB free`} sub={`${sys.disk_used_gb} / ${sys.disk_total_gb} GB used`}>
          <Progress value={sys.disk_used_gb / sys.disk_total_gb} />
        </Stat>
      </div>
      {sys.gpu_lease && <Notice title="GPU reserved">A {sys.gpu_lease.kind} job has exclusive use of the GPU for {formatDuration(sys.gpu_lease.seconds)}. Chat answers run on the CPU meanwhile.</Notice>}
      {sys.last_oom_at && Date.now() / 1000 - sys.last_oom_at < 3600 && <Notice tone="warning" title="GPU out-of-memory recently">A job ran out of VRAM {timeAgo(new Date(sys.last_oom_at * 1000).toISOString())}. VELQIN freed memory and retried once.</Notice>}
      <Card>
        <div className="border-b border-line px-5 py-3 font-display text-sm font-semibold">Services</div>
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          {Object.entries(o.services).map(([name, s]) => (
            <div key={name} className="flex items-center gap-3 px-5 py-3">
              <StatusDot on={s.online} />
              <div className="flex-1"><div className="text-sm font-medium">{SERVICE_NAMES[name] ?? name}</div><div className="text-xs text-subtle">{s.purpose}</div></div>
              <span className={cn("text-xs", s.online ? "text-success" : "text-danger")}>{s.online ? (s.version ? `online · ${s.version}` : "online") : "offline"}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

type AdminUser = { id: string; username: string; display_name: string; role: string; plan: string; effective_plan: string; is_active: boolean; has_avatar: boolean; created_at: string; last_seen_at: string | null; counts: { chats: number; media: number; sessions: number } };

function UsersTab() {
  const me = useStore((s) => s.user)!;
  const toast = useStore((s) => s.toast);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [pwFor, setPwFor] = useState<AdminUser | null>(null);
  const [delFor, setDelFor] = useState<AdminUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const load = useCallback(() => api<{ users: AdminUser[] }>("/api/admin/users").then((r) => setUsers(r.users)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      load();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, tone: "error" });
    }
  }
  if (!users) return <Skeleton className="h-60" />;
  return (
    <>
      <Notice className="mb-4">Admins see account data only — never chats, prompts, files or media of other users.</Notice>
      <Card className="divide-y divide-line">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <Avatar user={u} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">{u.display_name || u.username}<span className="text-xs font-normal text-subtle">@{u.username}</span>{!u.is_active && <Badge tone="danger">disabled</Badge>}</div>
              <div className="text-xs text-subtle">{u.last_seen_at ? `seen ${timeAgo(u.last_seen_at)}` : "never signed in"} · {u.counts.chats} chats · {u.counts.media} media · {u.counts.sessions} sessions</div>
            </div>
            {u.role === "owner" ? <Badge tone="accent">Owner</Badge> : (
              <div className="flex flex-wrap items-center gap-2">
                <select value={u.plan} onChange={(e) => patch(u.id, { plan: e.target.value })} className="h-9 rounded-xl border border-line bg-surface px-2 text-sm" aria-label="Plan">
                  {["free", "creator", "studio"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {me.role === "owner" && (
                  <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} className="h-9 rounded-xl border border-line bg-surface px-2 text-sm" aria-label="Role">
                    <option value="user">user</option><option value="admin">admin</option>
                  </select>
                )}
                <div className="flex items-center gap-2 px-1 text-xs text-muted"><Switch checked={u.is_active} onChange={(v) => patch(u.id, { is_active: v })} label="Active" />active</div>
                <Button size="sm" variant="ghost" onClick={() => { setPwFor(u); setNewPw(""); }}>Reset password</Button>
                {me.role === "owner" && <Button size="icon-sm" variant="ghost" onClick={() => setDelFor(u)} aria-label="Delete user"><Trash2 className="h-4 w-4" /></Button>}
              </div>
            )}
          </div>
        ))}
      </Card>
      <Dialog open={!!pwFor} onClose={() => setPwFor(null)} title={`New password for ${pwFor?.username}`} description="All of their devices are signed out."
        footer={<><Button variant="ghost" onClick={() => setPwFor(null)}>Cancel</Button><Button variant="primary" disabled={newPw.length < 8} onClick={async () => { await patch(pwFor!.id, { new_password: newPw }); setPwFor(null); toast({ title: "Password reset", tone: "success" }); }}>Set password</Button></>}>
        <Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" />
      </Dialog>
      <ConfirmDialog open={!!delFor} onClose={() => setDelFor(null)} onConfirm={async () => { await api(`/api/admin/users/${delFor!.id}`, { method: "DELETE" }); setDelFor(null); load(); }} title={`Delete ${delFor?.username}?`} description="The account and all of its chats, files and media are deleted permanently." />
    </>
  );
}

type Invite = { id: string; hint: string; note: string; role: string; plan: string; max_uses: number; uses: number; revoked: boolean; expired: boolean; expires_at: string | null; created_at: string };
function InvitesTab() {
  const me = useStore((s) => s.user)!;
  const toast = useStore((s) => s.toast);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [form, setForm] = useState({ note: "", plan: "free", role: "user", max_uses: 1, expires_days: 14 });
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => api<{ invites: Invite[] }>("/api/admin/invites").then((r) => setInvites(r.invites)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  async function create() {
    try {
      const r = await api<{ code: string }>("/api/admin/invites", { body: form });
      setCode(r.code);
      setCopied(false);
      load();
    } catch (e) {
      toast({ title: "Could not create invite", description: (e as Error).message, tone: "error" });
    }
  }
  const link = code && typeof window !== "undefined" ? `${window.location.origin}/register/?invite=${code}` : "";
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <h3 className="font-display font-semibold">New invite</h3>
        <Field label="Note (who is it for?)"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Max from class 10b" maxLength={120} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan"><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm">{["free", "creator", "studio"].map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Role"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"><option>user</option>{me.role === "owner" && <option>admin</option>}</select></Field>
          <Field label="Uses"><Input type="number" min={1} max={50} value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })} /></Field>
          <Field label="Valid (days)"><Input type="number" min={1} max={365} value={form.expires_days} onChange={(e) => setForm({ ...form, expires_days: Number(e.target.value) })} /></Field>
        </div>
        <Button variant="primary" className="w-full" onClick={create}><Plus className="h-4 w-4" />Create invite</Button>
      </Card>
      <Card className="divide-y divide-line">
        {invites?.length === 0 && <p className="px-5 py-4 text-sm text-subtle">No invites yet.</p>}
        {invites?.map((i) => {
          const dead = i.revoked || i.expired || i.uses >= i.max_uses;
          return (
            <div key={i.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5", dead && "opacity-55")}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm"><span className="font-mono">VQ-…-{i.hint}</span>{i.note && <span className="text-muted">· {i.note}</span>}</div>
                <div className="text-xs text-subtle">{i.plan} · {i.role} · used {i.uses}/{i.max_uses}{i.expires_at ? ` · expires ${new Date(i.expires_at).toLocaleDateString()}` : ""}</div>
              </div>
              {i.revoked ? <Badge>revoked</Badge> : i.expired ? <Badge>expired</Badge> : i.uses >= i.max_uses ? <Badge tone="success">used</Badge> : (
                <Button size="sm" variant="ghost" onClick={() => api(`/api/admin/invites/${i.id}`, { method: "DELETE" }).then(load)}><X className="h-3.5 w-3.5" />Revoke</Button>
              )}
            </div>
          );
        })}
      </Card>
      <Dialog open={!!code} onClose={() => setCode(null)} title="Invite created" description="Share this code or link. It is shown only once.">
        <div className="rounded-2xl bg-surface-2 p-4 text-center font-mono text-lg tracking-wider">{code}</div>
        <div className="mt-3 break-all rounded-xl border border-line px-3 py-2 text-xs text-muted">{link}</div>
        <Button className="mt-4 w-full" variant="primary" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy invite link"}</Button>
      </Dialog>
    </div>
  );
}

function JobsTab() {
  const [jobs, setJobs] = useState<(Job & { username: string })[] | null>(null);
  const load = useCallback(() => api<{ jobs: (Job & { username: string })[] }>("/api/admin/jobs").then((r) => setJobs(r.jobs)).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  if (!jobs) return <Skeleton className="h-60" />;
  if (!jobs.length) return <EmptyState icon={<ListChecks className="h-5 w-5" />} title="No jobs yet" />;
  return (
    <Card className="divide-y divide-line">
      {jobs.map((j) => (
        <div key={j.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <Badge tone={j.status === "running" ? "accent" : j.status === "done" ? "success" : j.status === "failed" ? "danger" : "default"}>{j.status}</Badge>
          <div className="min-w-0 flex-1">
            <div className="text-sm">{j.kind} · {j.params.mode} · <span className="text-muted">@{j.username}</span>{j.position ? ` · #${j.position} in queue` : ""}</div>
            <div className="truncate text-xs text-subtle">{j.status === "running" ? `${j.step} · ${Math.round(j.progress * 100)}%` : j.error ?? timeAgo(j.created_at)}</div>
          </div>
          {(j.status === "queued" || j.status === "running") && <Button size="sm" variant="ghost" onClick={() => api(`/api/admin/jobs/${j.id}/cancel`, { method: "POST" }).then(load)}>Cancel</Button>}
        </div>
      ))}
    </Card>
  );
}

const SETTING_INFO: Record<string, { label: string; hint: string }> = {
  plans_enabled: { label: "Use access groups (plans)", hint: "Off = everybody gets all creative features." },
  public_registration: { label: "Public registration", hint: "Allow sign-up without invite code. Keep off for a private instance." },
  default_plan: { label: "Plan for public sign-ups", hint: "free, creator or studio" },
  max_queued_jobs_per_user: { label: "Max queued jobs per user", hint: "Fairness limit for the GPU queue." },
  image_job_timeout_s: { label: "Image job timeout (seconds)", hint: "" },
  video_job_timeout_s: { label: "Video job timeout (seconds)", hint: "30-second videos can take an hour+ on 8 GB VRAM." },
  max_upload_mb: { label: "Max upload size (MB)", hint: "" },
  chat_during_gpu_job: { label: "Chat while the GPU is busy", hint: "cpu = answer on the CPU (slower) · wait = queue the answer until the GPU is free" },
  allow_nsfw_generation: { label: "Allow explicit image/video content", hint: "Sexual content involving minors is always blocked." },
  web_search_enabled: { label: "Web search", hint: "Requires SearXNG on the server." },
  web_fetch_pages: { label: "Pages read per web search", hint: "More pages = better answers but slower." },
  default_model: { label: "Default model for new users", hint: "auto, swift, core, …" },
  max_video_seconds: { label: "Maximum video length (seconds)", hint: "5, 10, 15 or 30" },
};

function SettingsTab() {
  const me = useStore((s) => s.user)!;
  const toast = useStore((s) => s.toast);
  const [values, setValues] = useState<Record<string, any> | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  useEffect(() => { api<{ settings: Record<string, any> }>("/api/admin/settings").then((r) => { setValues(r.settings); setDraft(r.settings); }).catch(() => {}); }, []);
  if (!values) return <Skeleton className="h-60" />;
  const changed = Object.keys(draft).filter((k) => draft[k] !== values[k]);
  async function save() {
    try {
      const body = Object.fromEntries(changed.map((k) => [k, draft[k]]));
      const r = await api<{ settings: Record<string, any> }>("/api/admin/settings", { method: "PATCH", body });
      setValues(r.settings);
      setDraft(r.settings);
      toast({ title: "Settings saved", tone: "success" });
    } catch (e) {
      toast({ title: "Not saved", description: (e as Error).message, tone: "error" });
    }
  }
  const owner = me.role === "owner";
  return (
    <div className="space-y-4">
      {!owner && <Notice>Only the owner can change system settings.</Notice>}
      <Card className="divide-y divide-line">
        {Object.entries(draft).map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{SETTING_INFO[k]?.label ?? k}</div>
              {SETTING_INFO[k]?.hint && <div className="text-xs text-subtle">{SETTING_INFO[k].hint}</div>}
            </div>
            {typeof v === "boolean" ? <Switch checked={v} disabled={!owner} onChange={(x) => setDraft({ ...draft, [k]: x })} /> :
              typeof v === "number" ? <Input type="number" disabled={!owner} className="h-9 w-28" value={v} onChange={(e) => setDraft({ ...draft, [k]: Math.round(Number(e.target.value)) })} /> :
                <Input disabled={!owner} className="h-9 w-40" value={v} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}
          </div>
        ))}
      </Card>
      {owner && <Button variant="primary" disabled={!changed.length} onClick={save}>Save {changed.length ? `(${changed.length})` : ""}</Button>}
    </div>
  );
}

function LogsTab() {
  const [entries, setEntries] = useState<{ time: number; level: string; logger: string; message: string }[] | null>(null);
  useEffect(() => { api<{ entries: any[] }>("/api/admin/logs").then((r) => setEntries(r.entries)).catch(() => {}); }, []);
  if (!entries) return <Skeleton className="h-60" />;
  return (
    <>
      <Notice className="mb-4">Warnings and errors since the last start. Logs never contain chat contents, prompts or file contents. Full log: <code>storage/logs/velqin.log</code>.</Notice>
      {entries.length === 0 ? <EmptyState icon={<Server className="h-5 w-5" />} title="No warnings or errors" /> : (
        <Card className="divide-y divide-line font-mono text-xs">
          {entries.map((e, i) => (
            <div key={i} className="flex gap-3 px-4 py-2.5">
              <span className="shrink-0 text-subtle">{new Date(e.time * 1000).toLocaleTimeString()}</span>
              <span className={cn("shrink-0", e.level === "ERROR" ? "text-danger" : "text-warning")}>{e.level}</span>
              <span className="min-w-0 break-words text-muted">{e.logger}: {e.message}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function BackupsTab() {
  const me = useStore((s) => s.user)!;
  const toast = useStore((s) => s.toast);
  const [list, setList] = useState<{ name: string; size: number; created: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState(false);
  const load = useCallback(() => api<{ backups: any[] }>("/api/admin/backups").then((r) => setList(r.backups)).catch(() => setList([])), []);
  useEffect(() => { if (me.role === "owner") load(); }, [load, me.role]);
  if (me.role !== "owner") return <Notice>Only the owner can manage backups.</Notice>;
  async function create() {
    setBusy(true);
    try {
      await api("/api/admin/backups", { body: { include_files: files } });
      toast({ title: "Backup created", tone: "success" });
      load();
    } catch (e) {
      toast({ title: "Backup failed", description: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex-1">
          <div className="text-sm font-medium">Create backup</div>
          <div className="text-xs text-subtle">A consistent snapshot of the database. Restore with <code>python scripts/restore-backup.py</code> while VELQIN is stopped.</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted"><Switch checked={files} onChange={setFiles} />include uploads & media</label>
        <Button variant="primary" loading={busy} onClick={create}><Archive className="h-4 w-4" />Back up now</Button>
      </Card>
      <Card className="divide-y divide-line">
        {list?.length === 0 && <p className="px-5 py-4 text-sm text-subtle">No backups yet.</p>}
        {list?.map((b) => (
          <div key={b.name} className="flex items-center gap-3 px-5 py-3">
            <Archive className="h-4 w-4 text-subtle" />
            <div className="min-w-0 flex-1"><div className="truncate font-mono text-sm">{b.name}</div><div className="text-xs text-subtle">{formatBytes(b.size)} · {new Date(b.created * 1000).toLocaleString()}</div></div>
            <a href={`/api/admin/backups/${b.name}`} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Download"><Download className="h-4 w-4" /></a>
            <button onClick={() => api(`/api/admin/backups/${b.name}`, { method: "DELETE" }).then(load)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}
