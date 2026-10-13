"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { useStore } from "@/lib/store";
import { applyTheme, readTheme } from "@/lib/theme";
import { LoadingScreen } from "./loading-screen";

const PUBLIC = ["/login/", "/register/", "/setup/"];

export function Providers({ children }: { children: React.ReactNode }) {
  const auth = useStore((s) => s.auth);
  const loadSession = useStore((s) => s.loadSession);
  const router = useRouter();
  const pathname = usePathname() || "/";
  const path = pathname.endsWith("/") ? pathname : pathname + "/";

  useEffect(() => {
    loadSession();
    const t = readTheme();
    applyTheme(t.mode, t.accent);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const cur = readTheme();
      if (cur.mode === "system") applyTheme("system", cur.accent);
    };
    mq.addEventListener("change", onChange);
    const onUnauthorized = () => useStore.getState().setUser(null);
    window.addEventListener("velqin:unauthorized", onUnauthorized);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("velqin:unauthorized", onUnauthorized);
    };
  }, [loadSession]);

  useEffect(() => {
    if (auth === "loading") return;
    if (auth === "setup" && path !== "/setup/") router.replace("/setup/");
    else if (auth === "anon" && !PUBLIC.includes(path)) {
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      router.replace(`/login/?next=${encodeURIComponent(next)}`);
    } else if (auth === "authed" && PUBLIC.includes(path)) router.replace("/");
  }, [auth, path, router]);

  const isPublic = PUBLIC.includes(path);
  const ready = auth !== "loading" && ((auth === "authed" && !isPublic) || (auth !== "authed" && isPublic && (auth !== "setup" || path === "/setup/")));
  return (
    <>
      {ready ? children : <LoadingScreen />}
      <Toaster />
    </>
  );
}
