"use client";
import { Check, Copy } from "lucide-react";
import { isValidElement, memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Source } from "@/lib/types";
import { cn } from "@/lib/utils";

function toText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (isValidElement(node)) return toText((node.props as { children?: ReactNode }).children);
  return "";
}

/** Turn [1], [2][3], [F1], [P2] citations into links — but never inside code. */
export function linkCitations(text: string, sources?: Source[]): string {
  if (!sources?.length) return text;
  const valid = new Set(sources.map((s) => String(s.index)));
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\[((?:[FP])?\d{1,2})\](?![(:])/g, (m, id) => (valid.has(id) ? `[${id}](#cite-${id})` : m))))
    .join("");
}

/** KaTeX: models often emit \( \) and \[ \] — normalize to $ / $$ for remark-math. */
function normalizeMath(text: string) {
  return text
    .split(/(```[\s\S]*?(?:```|$))/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)))
    .join("");
}

function CodeBlock({ lang, children, raw }: { lang: string; children: ReactNode; raw: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block not-prose my-1">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-1.5 text-xs text-subtle">
        <span className="font-mono">{lang || "text"}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(raw).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface hover:text-fg"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className="hljs">{children}</code>
      </pre>
    </div>
  );
}

function Citation({ id, sources }: { id: string; sources?: Source[] }) {
  const s = sources?.find((x) => String(x.index) === id);
  const isFile = s?.kind === "file";
  const inner = (
    <span
      className={cn(
        "mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-0.5 items-center justify-center rounded-md px-1 align-middle text-[10.5px] font-semibold no-underline transition",
        isFile ? "bg-success/12 text-success" : "bg-accent-soft text-accent hover:bg-accent hover:text-accent-fg",
      )}
    >
      {id}
    </span>
  );
  if (s?.url) {
    return (
      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" title={`${s.title}${s.domain ? ` — ${s.domain}` : ""}`} className="!no-underline">
        {inner}
      </a>
    );
  }
  return <span title={s?.title}>{inner}</span>;
}

export const Markdown = memo(function Markdown({ text, sources, className }: { text: string; sources?: Source[]; className?: string }) {
  const content = linkCitations(normalizeMath(text), sources);
  return (
    <div className={cn("prose-velqin", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }], [rehypeHighlight, { detect: true }]]}
        components={{
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            if (isValidElement(child)) {
              const props = child.props as { className?: string; children?: ReactNode };
              const lang = /language-([\w+#-]+)/.exec(props.className || "")?.[1] ?? "";
              return <CodeBlock lang={lang} raw={toText(props.children).replace(/\n$/, "")}>{props.children}</CodeBlock>;
            }
            return <pre>{children}</pre>;
          },
          table({ children }) {
            return (
              <div className="table-wrap">
                <table>{children}</table>
              </div>
            );
          },
          a({ href, children }) {
            if (href?.startsWith("#cite-")) return <Citation id={href.slice(6)} sources={sources} />;
            const external = href && /^https?:/i.test(href);
            return (
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer nofollow" : undefined}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
