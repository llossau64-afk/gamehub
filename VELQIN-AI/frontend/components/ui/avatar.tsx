"use client";
import { useState } from "react";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Avatar({ user, size = 32, className, version }: { user: Pick<User, "id" | "display_name" | "username" | "has_avatar">; size?: number; className?: string; version?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = (user.display_name || user.username).split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  if (user.has_avatar && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/auth/avatar/${user.id}${version ? `?v=${version}` : ""}`}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-line", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/80 to-accent-2/80 font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
