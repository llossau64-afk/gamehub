"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setUser = useStore((s) => s.setUser);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>("/api/auth/login", { body: { username: username.trim(), password } });
      const next = new URLSearchParams(window.location.search).get("next");
      setUser(r.user);
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to your private AI platform."
      footer={<>Have an invite code? <Link href="/register/" className="font-medium text-accent hover:underline">Create your account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" htmlFor="u">
          <Input id="u" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password" htmlFor="p">
          <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!username || !password}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
