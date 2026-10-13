"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

export default function SetupPage() {
  const [form, setForm] = useState({ username: "", display_name: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setUser = useStore((s) => s.setUser);
  const router = useRouter();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>("/api/auth/setup", { body: { username: form.username.trim(), display_name: form.display_name, password: form.password } });
      setUser(r.user);
      router.replace("/models/?welcome=1");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Set up VELQIN" subtitle="Create the owner account. You'll have full control: models, users, invites and system settings.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Owner username" htmlFor="un">
          <Input id="un" autoComplete="username" autoCapitalize="none" pattern="[A-Za-z0-9_.\-]{3,32}" value={form.username} onChange={set("username")} required autoFocus />
        </Field>
        <Field label="Display name" htmlFor="dn">
          <Input id="dn" value={form.display_name} onChange={set("display_name")} maxLength={80} />
        </Field>
        <Field label="Password" htmlFor="pw" hint="Use a strong password — this account can manage everything.">
          <Input id="pw" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required />
        </Field>
        <Field label="Confirm password" htmlFor="pw2">
          <Input id="pw2" type="password" autoComplete="new-password" minLength={8} value={form.confirm} onChange={set("confirm")} required />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          <ShieldCheck className="h-4 w-4" /> Create owner account
        </Button>
        <p className="text-center text-xs text-subtle">Public registration stays disabled. Friends join with invite codes you create.</p>
      </form>
    </AuthLayout>
  );
}
