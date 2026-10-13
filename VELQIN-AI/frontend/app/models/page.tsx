"use client";
import { motion } from "motion/react";
import { Check, Cpu, Download, HardDrive, Loader2, Lock, Plus, Power, RefreshCw, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card, Notice, Progress, Skeleton, StatusDot, Switch } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { ModelProfile } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

type Pull = { tag: string; state: "running" | "done" | "error"; status: string; percent: number; completed: number; total: number; error: string | null };
type Library = {
  runtime_online: boolean; version: string | null;
  installed: { name: string; size: number; modified_at: string; details: { parameter_size?: string; quantization_level?: string } }[];
  running: { name: string; size_vram: number }[];
  profiles: ModelProfile[];
  catalog: { tag: string; size_gb: number; vram_gb: number; use: string; license: string; installed: boolean; recommended: boolean }[];
  pulls: Pull[];
  hardware: { vram_gb: number | null; ram_gb: number; gpu: string | null };
  plans: string[];
};

export default function ModelsPage() {
  const user = useStore((s) => s.user)!;
  const isAdmin = user.features.includes("admin");
  return <AppShell title="Model Library">{isAdmin ? <AdminModels /> : <UserModels />}</AppShell>;
}

function UserModels() {
  const models = useStore((s) => s.models);
  const online = useStore((s) => s.runtimeOnline);
  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Header />
        {!online && <Notice tone="warning" title="AI runtime offline">The server's Ollama runtime isn't running right now.</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          {models.map((m) => <ProfileCard key={m.id} p={m} />)}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Model Library</h1>
      <p className="mt-1 text-sm text-muted">All models run locally on the VELQIN server with Ollama — no cloud, no API costs. VELQIN Auto picks the right one for each message.</p>
    </div>
  );
}

function ProfileCard({ p, admin, onChange, pull, onPull }: { p: ModelProfile; admin?: boolean; onChange?: () => void; pull?: Pull; onPull?: (tag: string) => void }) {
  const toast = useStore((s) => s.toast);
  const [edit, setEdit] = useState(false);
  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/models/profiles/${p.id}`, { method: "PATCH", body });
      onChange?.();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, tone: "error" });
    }
  }
  return (
    <Card className={cn("p-5", !p.enabled && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold">{p.name}</h3>
            {p.loaded && <Badge tone="success"><Zap className="h-3 w-3" />loaded</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-muted">{p.tagline}</p>
        </div>
        {admin ? <Switch checked={p.enabled} onChange={(v) => patch({ enabled: v })} label="Enabled" /> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge className="font-mono">{p.ollama_tag}</Badge>
        {p.installed ? <Badge tone="success"><Check className="h-3 w-3" />installed{p.size_bytes ? ` · ${formatBytes(p.size_bytes)}` : ""}</Badge> : <Badge tone="warning">not installed · ~{p.size_hint_gb} GB</Badge>}
        {p.vision && <Badge tone="accent">vision</Badge>}
        {p.thinking && <Badge tone="accent">reasoning</Badge>}
        {p.min_plan !== "free" && <Badge><Lock className="h-3 w-3" />{p.min_plan}+</Badge>}
        {!p.allowed && !admin && <Badge tone="danger">not in your plan</Badge>}
        {p.license && <Badge>{p.license}</Badge>}
      </div>
      {admin && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!p.installed && (pull?.state === "running" ? (
            <div className="w-full">
              <div className="mb-1 flex justify-between text-xs text-muted"><span>{pull.status}</span><span>{pull.percent}%</span></div>
              <Progress value={pull.percent / 100} />
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => onPull?.(p.ollama_tag)}><Download className="h-3.5 w-3.5" />Download</Button>
          ))}
          {pull?.state === "error" && <span className="text-xs text-danger">{pull.error}</span>}
          <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>Configure</Button>
        </div>
      )}
      {admin && <ProfileEditor open={edit} onClose={() => setEdit(false)} p={p} onSave={async (b) => { await patch(b); setEdit(false); }} />}
    </Card>
  );
}

function ProfileEditor({ open, onClose, p, onSave }: { open: boolean; onClose: () => void; p: ModelProfile; onSave: (b: Record<string, unknown>) => void }) {
  const [tag, setTag] = useState(p.ollama_tag);
  const [ctx, setCtx] = useState(p.context_length);
  const [temp, setTemp] = useState(p.temperature);
  const [plan, setPlan] = useState(p.min_plan);
  const [thinking, setThinking] = useState(p.thinking);
  const [vision, setVision] = useState(p.vision);
  useEffect(() => {
    if (open) { setTag(p.ollama_tag); setCtx(p.context_length); setTemp(p.temperature); setPlan(p.min_plan); setThinking(p.thinking); setVision(p.vision); }
  }, [open, p]);
  return (
    <Dialog open={open} onClose={onClose} title={`Configure ${p.name}`} description="Map this VELQIN profile to any local Ollama model."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ ollama_tag: tag.trim(), context_length: ctx, temperature: temp, min_plan: plan, thinking, vision })}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Ollama model tag" hint="e.g. qwen3:4b, qwen3:8b, gemma3:4b — download it first or below."><Input value={tag} onChange={(e) => setTag(e.target.value)} className="font-mono" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Context length (tokens)" hint="8192 fits 8 GB VRAM well."><Input type="number" min={1024} max={131072} step={1024} value={ctx} onChange={(e) => setCtx(Number(e.target.value))} /></Field>
          <Field label="Temperature"><Input type="number" min={0} max={2} step={0.1} value={temp} onChange={(e) => setTemp(Number(e.target.value))} /></Field>
        </div>
        <Field label="Minimum access group">
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm">
            {["free", "creator", "studio", "owner"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm"><span>Supports reasoning (“think”)</span><Switch checked={thinking} onChange={setThinking} /></div>
        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm"><span>Can see images (vision)</span><Switch checked={vision} onChange={setVision} /></div>
        <p className="text-xs text-subtle">Enable “reasoning” only for models that support thinking (e.g. Qwen3); others reject the flag.</p>
      </div>
    </Dialog>
  );
}

function AdminModels() {
  const [lib, setLib] = useState<Library | null>(null);
  const [custom, setCustom] = useState("");
  const [del, setDel] = useState<string | null>(null);
  const toast = useStore((s) => s.toast);
  const loadModels = useStore((s) => s.loadModels);
  const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome");

  const load = useCallback(async () => {
    try {
      setLib(await api<Library>("/api/models/library"));
    } catch (e) {
      toast({ title: "Could not load models", description: (e as Error).message, tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);
  const pulling = lib?.pulls.some((p) => p.state === "running");
  useEffect(() => {
    if (!pulling) return;
    const t = setInterval(async () => {
      const r = await api<{ pulls: Pull[] }>("/api/models/pulls").catch(() => null);
      if (!r) return;
      setLib((l) => (l ? { ...l, pulls: r.pulls } : l));
      if (!r.pulls.some((p) => p.state === "running")) {
        load();
        loadModels();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [pulling, load, loadModels]);

  async function pull(tag: string) {
    try {
      const r = await api<{ pull: Pull }>("/api/models/pull", { body: { tag } });
      setLib((l) => (l ? { ...l, pulls: [...l.pulls.filter((p) => p.tag !== tag), r.pull] } : l));
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, tone: "error" });
    }
  }
  async function remove(tag: string) {
    try {
      await api(`/api/models/installed/${encodeURIComponent(tag)}`, { method: "DELETE" });
      setDel(null);
      load();
      loadModels();
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, tone: "error" });
    }
  }
  async function unloadAll() {
    const r = await api<{ unloaded: string[] }>("/api/models/unload", { method: "POST" });
    toast({ title: r.unloaded.length ? `Unloaded ${r.unloaded.join(", ")}` : "No model was loaded", tone: "success" });
    load();
  }

  if (!lib) return <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-8"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  const pullFor = (tag: string) => lib.pulls.find((p) => p.tag === tag);

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <Header />
        {welcome && (
          <Notice title="Welcome! Let's install your first model.">
            Click <b>Download</b> on VELQIN Swift (qwen3:4b, ~2.6 GB) — it's fast and fits easily on an RTX 4060. Add VELQIN Core, Vision and Code whenever you like.
          </Notice>
        )}
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5 text-sm">
          <div className="flex items-center gap-2"><StatusDot on={lib.runtime_online} /><span className="font-medium">Ollama {lib.runtime_online ? `online${lib.version ? ` · v${lib.version}` : ""}` : "offline"}</span></div>
          <div className="flex items-center gap-2 text-muted"><Cpu className="h-4 w-4" />{lib.hardware.gpu ?? "No NVIDIA GPU detected"}{lib.hardware.vram_gb ? ` · ${lib.hardware.vram_gb} GB VRAM` : ""}</div>
          <div className="flex items-center gap-2 text-muted"><HardDrive className="h-4 w-4" />{lib.hardware.ram_gb} GB RAM</div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
            <Button size="sm" variant="secondary" onClick={unloadAll} title="Free VRAM by unloading all chat models"><Power className="h-3.5 w-3.5" />Unload all</Button>
          </div>
        </Card>
        {!lib.runtime_online && <Notice tone="warning" title="Ollama is not running">Install it from ollama.com and start it (scripts\\install-windows.ps1 does this for you). Then press Refresh.</Notice>}

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">VELQIN profiles</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {lib.profiles.map((p) => <ProfileCard key={p.id} p={p} admin onChange={() => { load(); loadModels(); }} pull={pullFor(p.ollama_tag)} onPull={pull} />)}
          </div>
        </section>

        <section>
          <h2 className="mb-1 font-display text-lg font-semibold">Recommended for your hardware</h2>
          <p className="mb-3 text-sm text-muted">Sizes are approximate (Q4 quantization). Models larger than your VRAM still run, but partly on the CPU and much slower.</p>
          <Card className="divide-y divide-line">
            {lib.catalog.map((c) => {
              const pl = pullFor(c.tag);
              return (
                <div key={c.tag} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="font-mono text-sm">{c.tag}</span>{c.recommended ? <Badge tone="success">fits your GPU</Badge> : <Badge tone="warning">needs more VRAM</Badge>}</div>
                    <div className="mt-0.5 text-xs text-subtle">{c.use} · ~{c.size_gb} GB download · ~{c.vram_gb} GB VRAM · {c.license}</div>
                  </div>
                  {pl?.state === "running" ? (
                    <div className="w-40"><div className="mb-1 text-right text-xs text-muted">{pl.percent}%</div><Progress value={pl.percent / 100} /></div>
                  ) : c.installed ? (
                    <Badge tone="success"><Check className="h-3 w-3" />installed</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => pull(c.tag)} disabled={!lib.runtime_online}><Download className="h-3.5 w-3.5" />Download</Button>
                  )}
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Installed in Ollama</h2>
          <Card className="divide-y divide-line">
            {lib.installed.length === 0 && <p className="px-5 py-4 text-sm text-subtle">Nothing installed yet.</p>}
            {lib.installed.map((m) => (
              <motion.div layout key={m.name} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-mono text-sm">{m.name}{lib.running.some((r) => r.name === m.name) && <Badge tone="success">in memory</Badge>}</div>
                  <div className="text-xs text-subtle">{formatBytes(m.size)}{m.details?.parameter_size ? ` · ${m.details.parameter_size}` : ""}{m.details?.quantization_level ? ` · ${m.details.quantization_level}` : ""}</div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => setDel(m.name)} aria-label="Delete model"><Trash2 className="h-4 w-4" /></Button>
              </motion.div>
            ))}
          </Card>
          <div className="mt-3 flex gap-2">
            <Input placeholder="Any Ollama tag, e.g. gemma3:4b" value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono" />
            <Button variant="secondary" disabled={!custom.trim() || !lib.runtime_online} onClick={() => { pull(custom.trim()); setCustom(""); }}>
              {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Pull
            </Button>
          </div>
          {lib.pulls.filter((p) => !lib.profiles.some((x) => x.ollama_tag === p.tag) && !lib.catalog.some((c) => c.tag === p.tag)).map((p) => (
            <div key={p.tag} className="mt-3 text-sm">
              <div className="mb-1 flex justify-between text-xs text-muted"><span className="font-mono">{p.tag} · {p.state === "error" ? p.error : p.status}</span><span>{p.percent}%</span></div>
              {p.state === "running" && <Progress value={p.percent / 100} />}
            </div>
          ))}
        </section>
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove(del)} title={`Delete ${del}?`} description="The model files are removed from disk. You can download it again later." />
    </div>
  );
}
