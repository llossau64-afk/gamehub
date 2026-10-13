"use client";
import { Check, Crown, Gift, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, Notice } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Plan = { id: string; name: string; tagline: string; highlights: string[] };

export default function PlansPage() {
  const [data, setData] = useState<{ enabled: boolean; current: string; plans: Plan[] } | null>(null);
  useEffect(() => {
    api<{ enabled: boolean; current: string; plans: Plan[] }>("/api/plans").then(setData).catch(() => {});
  }, []);
  return (
    <AppShell title="Plans">
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success"><Gift className="h-3.5 w-3.5" />Every plan is free</div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Access groups, not subscriptions</h1>
            <p className="mt-3 text-muted">VELQIN runs on a private server with local AI. Plans only decide which features each person can use — the owner assigns them. There is nothing to buy and no credits.</p>
          </div>
          {data && !data.enabled && <Notice className="mx-auto mt-6 max-w-2xl" title="Plans are switched off">The owner disabled access groups — everyone can use all creative features.</Notice>}
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data?.plans.map((p) => {
              const current = p.id === data.current;
              return (
                <Card key={p.id} className={cn("relative flex flex-col p-6", current && "border-accent shadow-float")}>
                  {current && <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-fg">Your plan</span>}
                  <div className="flex items-center gap-2">
                    {p.id === "owner" ? <Crown className="h-4 w-4 text-accent" /> : <Sparkles className="h-4 w-4 text-accent" />}
                    <h2 className="font-display text-lg font-semibold">{p.name}</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                  <div className="mt-5 font-display text-2xl font-semibold">€0<span className="text-sm font-normal text-subtle"> · forever</span></div>
                  <ul className="mt-5 space-y-2.5 text-sm">
                    {p.highlights.map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />{h}</li>)}
                  </ul>
                </Card>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-subtle">Want a different plan? Ask the owner of this VELQIN instance.</p>
        </div>
      </div>
    </AppShell>
  );
}
