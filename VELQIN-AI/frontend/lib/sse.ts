/** Minimal SSE reader over fetch (supports POST bodies, unlike EventSource). */
export type SSEMessage = { id?: number; data: any };

export async function readSSE(res: Response, onMessage: (m: SSEMessage) => void, signal?: AbortSignal) {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", abort);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        let id: number | undefined;
        const dataLines: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith("id:")) id = Number(line.slice(3).trim());
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length) {
          try {
            onMessage({ id, data: JSON.parse(dataLines.join("\n")) });
          } catch {
            /* ignore malformed event */
          }
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
