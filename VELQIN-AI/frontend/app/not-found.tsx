import Link from "next/link";

export default function NotFound() {
  return (
    <div className="h-app flex flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
      <div className="font-display text-5xl font-semibold text-subtle">404</div>
      <p className="text-muted">This page doesn&apos;t exist.</p>
      <Link href="/" className="mt-2 rounded-xl bg-fg px-4 py-2 text-sm font-medium text-bg">Back to VELQIN</Link>
    </div>
  );
}
