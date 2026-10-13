export type User = {
  id: string; username: string; display_name: string; role: "owner" | "admin" | "user"; plan: string;
  effective_plan: string; features: string[]; has_avatar: boolean; memory_enabled: boolean;
  prefs: Record<string, any>; created_at: string;
};

export type ModelProfile = {
  id: string; name: string; tagline: string; ollama_tag: string; role: string; vision: boolean; thinking: boolean;
  context_length: number; temperature: number; min_plan: string; enabled: boolean; builtin: boolean;
  size_hint_gb: number; license: string; installed: boolean; size_bytes: number | null; loaded: boolean;
  allowed: boolean; runtime_online: boolean;
};

export type ChatSummary = { id: string; title: string; model: string; pinned: boolean; project_id: string | null; created_at: string; updated_at: string };

export type Source = { index: number | string; title: string; url?: string; domain?: string; published?: string | null; snippet?: string; fetched?: boolean; kind: "web" | "file"; attachment_id?: string };

export type AttachmentInfo = { id: string; filename: string; kind: "document" | "image"; size: number; mime: string };

export type Message = {
  id: string; chat_id: string; seq: number; role: "user" | "assistant"; content: string; thinking: string;
  status: "streaming" | "complete" | "stopped" | "error" | "interrupted"; model_profile: string | null;
  model_tag: string | null; meta: {
    knowledge?: string[]; sources?: Source[]; error?: string; tokens?: number; tokens_per_s?: number;
    routed?: string; profile_name?: string; cpu_fallback?: boolean; web_error?: string; first_token_s?: number;
    duration_s?: number; web_search?: boolean;
  };
  attachment_ids: string[]; attachments?: AttachmentInfo[]; created_at: string | null; live?: boolean;
  statusText?: string;
};

export type Project = { id: string; name: string; description: string; instructions: string; color: string; created_at: string; updated_at: string; counts?: { chats: number; files: number; images: number; videos: number } };

export type Job = {
  id: string; kind: "image" | "video"; status: "queued" | "running" | "done" | "failed" | "cancelled"; progress: number;
  step: string; params: Record<string, any>; result: { media_ids?: string[]; seed?: number; segments?: number };
  error: string | null; attempts: number; position: number | null; created_at: string; started_at: string | null;
  finished_at: string | null; username?: string;
};

export type MediaItem = { id: string; kind: "image" | "video"; mime: string; width: number; height: number; duration: number; prompt: string; params: Record<string, any>; favorite: boolean; project_id: string | null; job_id: string | null; has_thumb: boolean; created_at: string };

export type Preset = { id: string; name: string; kind: "image" | "video"; description: string; license: string; modes: string[]; available: boolean; missing: string[]; has_8step?: boolean };
