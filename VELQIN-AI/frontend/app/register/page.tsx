"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

export default function RegisterPage() {
  const [form, setForm] = useState({ invite_code: "", username: "", display_name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setUser = useStore((s) => s.setUser);
  const publicReg = useStore((s) => s.publicRegistration);
  const router = useRouter();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) setForm((f) => ({ ...f, invite_code: code }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>("/api/auth/register", { body: { ...form, invite_code: form.invite_code.trim().toUpperCase(), username: form.username.trim() } });
      setUser(r.user);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthLayout
      title="Join VELQIN"
      subtitle={publicReg ? "Create your account." : "VELQIN is private. You need an invite code from the owner."}
      footer={<>Already have an account? <Link href="/login/" className="font-medium text-accent hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={publicReg ? "Invite code (optional)" : "Invite code"} htmlFor="code">
          <Input id="code" placeholder="VQ-XXXX-XXXX-XXXX" autoCapitalize="characters" value={form.invite_code} onChange={set("invite_code")} required={!publicReg} className="font-mono tracking-wider" />
        </Field>
        <Field label="Username" htmlFor="un" hint="3–32 characters: letters, numbers, . _ -">
          <Input id="un" autoComplete="username" autoCapitalize="none" pattern="[A-Za-z0-9_.\-]{3,32}" value={form.username} onChange={set("username")} required />
        </Field>
        <Field label="Display name" htmlFor="dn">
          <Input id="dn" autoComplete="nickname" value={form.display_name} onChange={set("display_name")} maxLength={80} />
        </Field>
        <Field label="Password" htmlFor="pw" hint="At least 8 characters.">
          <Input id="pw" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
