"use client";
import { ArrowLeft, FileText, FolderKanban, ImageIcon, MessageSquare, Plus, Save, Trash2, Upload, Video } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, EmptyState, Notice, Skeleton } from "@/components/ui/misc";
import { MediaGrid } from "@/components/studio/media-grid";
import { api, upload } from "@/lib/api";
import { hasFeature, useStore } from "@/lib/store";
import type { ChatSummary, MediaItem, Project } from "@/lib/types";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

const COLORS: Record<string, string> = { violet: "from-violet-500 to-indigo-500", blue: "from-blue-500 to-cyan-500", silver: "from-slate-400 to-slate-600", emerald: "from-emerald-500 to-teal-500", amber: "from-amber-500 to-orange-500", rose: "from-rose-500 to-pink-500", cyan: "from-cyan-500 to-sky-500" };

export default function ProjectsPage() {
  return <Suspense fallback={null}><Projects /></Suspense>;
}

function Projects() {
  const params = useSearchParams();
  const pid = params.get("p");
  return pid ? <ProjectDetail id={pid} /> : <ProjectList />;
}

function ProjectList() {
  const user = useStore((s) => s.user);
  const projects = useStore((s) => s.projects);
  const loadProjects = useStore((s) => s.loadProjects);
  const toast = useStore((s) => s.toast);
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "violet" });
  const canCreate = hasFeature(user, "projects");

  useEffect(() => {
    loadProjects().finally(() => setLoaded(true));
  }, [loadProjects]);

  async function create() {
    try {
      const r = await api<{ project: Project }>("/api/projects", { body: form });
      setOpen(false);
      await loadProjects();
      router.push(`/projects/?p=${r.project.id}`);
    } catch (e) {
      toast({ title: "Could not create project", description: (e as Error).message, tone: "error" });
    }
  }

  return (
    <AppShell title={<span className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-accent" />Projects</span>}
      actions={canCreate ? <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New project</Button> : null}>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted">Group chats, files, images and videos. VELQIN uses each project's instructions and files as context automatically.</p>
          {!canCreate && <Notice className="mt-5" title="VELQIN Studio feature">Creating projects is part of the Studio access group — ask the owner. It's free.</Notice>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!loaded && [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}
            {loaded && projects.map((p) => (
              <Link key={p.id} href={`/projects/?p=${p.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:border-line-strong">
                  <div className={cn("mb-4 h-9 w-9 rounded-xl bg-gradient-to-br", COLORS[p.color] ?? COLORS.violet)} />
                  <h3 className="font-display font-semibold">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted">{p.description || "No description"}</p>
                  <div className="mt-4 flex gap-3 text-xs text-subtle">
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p.counts?.chats ?? 0}</span>
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{p.counts?.files ?? 0}</span>
                    <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />{p.counts?.images ?? 0}</span>
                    <span className="flex items-center gap-1"><Video className="h-3 w-3" />{p.counts?.videos ?? 0}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {loaded && projects.length === 0 && canCreate && (
            <EmptyState icon={<FolderKanban className="h-5 w-5" />} title="No projects yet" action={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Create a project</Button>}>
              For example “My Racing Game”: collect design chats, concept art and reference files in one place.
            </EmptyState>
          )}
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={create} disabled={!form.name.trim()}>Create</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Racing Game" maxLength={120} /></Field>
          <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A neon arcade racer for PC and mobile…" /></Field>
          <Field label="Color">
            <div className="flex gap-2">
              {Object.keys(COLORS).map((c) => <button key={c} onClick={() => setForm({ ...form, color: c })} aria-label={c} className={cn("h-8 w-8 rounded-full bg-gradient-to-br ring-offset-2 ring-offset-elevated", COLORS[c], form.color === c && "ring-2 ring-accent")} />)}
            </div>
          </Field>
        </div>
      </Dialog>
    </AppShell>
  );
}

type FileRow = { id: string; filename: string; kind: string; size: number; created_at: string; indexed: boolean };

function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useStore((s) => s.toast);
  const loadProjects = useStore((s) => s.loadProjects);
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: "", description: "", instructions: "" });
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, f, m] = await Promise.all([
        api<{ project: Project }>(`/api/projects/${id}`),
        api<{ chats: ChatSummary[] }>(`/api/chats?project_id=${id}`),
        api<{ files: FileRow[] }>(`/api/files?project_id=${id}`),
        api<{ items: MediaItem[] }>(`/api/media?project_id=${id}&limit=60`),
      ]);
      setProject(p.project);
      setForm({ name: p.project.name, description: p.project.description, instructions: p.project.instructions });
      setChats(c.chats);
      setFiles(f.files);
      setMedia(m.items);
    } catch (e) {
      toast({ title: "Project not found", description: (e as Error).message, tone: "error" });
      router.replace("/projects/");
    }
  }, [id, router, toast]);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    try {
      const r = await api<{ project: Project }>(`/api/projects/${id}`, { method: "PATCH", body: form });
      setProject(r.project);
      loadProjects();
      toast({ title: "Project saved", tone: "success" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, tone: "error" });
    }
  }
  async function addFiles(list: FileList) {
    setUploading(true);
    for (const f of Array.from(list)) {
      const form = new FormData();
      form.append("file", f);
      form.append("project_id", id);
      await upload("/api/files", form).catch((e) => toast({ title: `${f.name}: upload failed`, description: e.message, tone: "error" }));
    }
    setUploading(false);
    load();
  }
  async function del() {
    await api(`/api/projects/${id}`, { method: "DELETE" });
    loadProjects();
    router.replace("/projects/");
  }
  const dirty = project && (form.name !== project.name || form.description !== project.description || form.instructions !== project.instructions);

  if (!project) return <AppShell title="Project"><div className="mx-auto w-full max-w-5xl space-y-4 p-6"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48" /></div></AppShell>;
  return (
    <AppShell title={<span className="flex items-center gap-2"><Link href="/projects/" className="text-muted hover:text-fg" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>{project.name}</span>}
      actions={<Button size="sm" variant="primary" onClick={() => router.push(`/?project=${id}&new=${Date.now()}`)}><Plus className="h-4 w-4" />New chat</Button>}>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 font-display text-base font-semibold">Chats</h2>
              <Card className="divide-y divide-line">
                {chats.length === 0 && <p className="px-5 py-4 text-sm text-subtle">No chats yet — start one with “New chat”.</p>}
                {chats.map((c) => (
                  <Link key={c.id} href={`/?c=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                    <MessageSquare className="h-4 w-4 text-subtle" />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                    <span className="text-xs text-subtle">{timeAgo(c.updated_at)}</span>
                  </Link>
                ))}
              </Card>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Files</h2>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileInput.current?.click()}><Upload className="h-3.5 w-3.5" />Upload</Button>
              </div>
              <Card className="divide-y divide-line">
                {files.length === 0 && <p className="px-5 py-4 text-sm text-subtle">Upload design docs, notes or references. VELQIN searches them (local embeddings) when you chat in this project.</p>}
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                    <FileText className="h-4 w-4 text-subtle" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.filename}</span>
                    <span className="text-xs text-subtle">{formatBytes(f.size)}{f.kind === "document" ? (f.indexed ? " · indexed" : " · not indexed") : ""}</span>
                  </div>
                ))}
              </Card>
            </section>
            <section>
              <h2 className="mb-3 font-display text-base font-semibold">Images & videos</h2>
              <MediaGrid items={media} onChange={setMedia} columns="grid-cols-3 sm:grid-cols-4" empty={<p className="text-sm text-subtle">Assign generated images or videos to this project from their detail view.</p>} />
            </section>
          </div>
          <aside className="space-y-4">
            <Card className="space-y-4 p-5">
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Instructions for VELQIN" hint="Applied to every chat in this project, e.g. tone, target platform, naming conventions.">
                <Textarea rows={7} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="You are the lead designer of a neon arcade racer. Keep answers practical and suggest Godot solutions." />
              </Field>
              <div className="flex gap-2">
                <Button variant="primary" onClick={save} disabled={!dirty || !form.name.trim()}><Save className="h-4 w-4" />Save</Button>
                <Button variant="ghost" className="ml-auto text-danger" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
            </Card>
          </aside>
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={del} title="Delete this project?" description="Chats, files and media stay in your library — only the project grouping is removed." />
    </AppShell>
  );
}
