"use client";
import { Check, ChevronDown, Lock, Sparkles } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function modelLabel(id: string, models: { id: string; name: string }[]) {
  if (id === "auto") return "VELQIN Auto";
  return models.find((m) => m.id === id)?.name ?? id;
}

export function ModelPicker({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const models = useStore((s) => s.models);
  const online = useStore((s) => s.runtimeOnline);
  const label = modelLabel(value, models).replace("VELQIN ", "");
  return (
    <Menu
      side="top"
      width={330}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          className={cn("flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted transition hover:bg-surface-2 hover:text-fg", open && "bg-surface-2 text-fg")}
          aria-label="Choose model"
        >
          {!compact && <Sparkles className="h-3.5 w-3.5 text-accent" />}
          <span className="max-w-[110px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <div className="py-1">
          {!online && <div className="mx-1 mb-1 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">The local AI runtime (Ollama) is offline.</div>}
          <Option
            active={value === "auto"}
            title="VELQIN Auto"
            subtitle="Picks the best installed model for each message"
            onClick={() => { onChange("auto"); close(); }}
          />
          <div className="my-1 h-px bg-line" />
          {models.map((m) => {
            const disabled = !m.installed || !m.allowed;
            return (
              <Option
                key={m.id}
                active={value === m.id}
                disabled={disabled}
                title={m.name}
                subtitle={m.tagline}
                badge={!m.allowed ? <span className="flex items-center gap-1"><Lock className="h-3 w-3" />{m.min_plan}</span> : !m.installed ? "not installed" : m.loaded ? "loaded" : undefined}
                onClick={() => { onChange(m.id); close(); }}
              />
            );
          })}
        </div>
      )}
    </Menu>
  );
}

function Option({ title, subtitle, active, disabled, badge, onClick }: { title: string; subtitle: string; active: boolean; disabled?: boolean; badge?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50", active && "bg-surface-2")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge ? <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-normal text-subtle">{badge}</span> : null}
        </div>
        <div className="mt-0.5 text-xs text-subtle">{subtitle}</div>
      </div>
      {active ? <Check className="mt-0.5 h-4 w-4 text-accent" /> : null}
    </button>
  );
}
