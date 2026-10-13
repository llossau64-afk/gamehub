/** Small fetch wrapper: same-origin cookies, CSRF header, readable errors. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const CSRF = { "X-Velqin-Request": "1" };

async function parseError(res: Response): Promise<ApiError> {
  let msg = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") msg = data.detail;
  } catch {
    /* not json */
  }
  if (res.status === 502 || res.status === 504) msg = "The VELQIN server is not reachable.";
  return new ApiError(res.status, msg);
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; form?: FormData } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  const headers: Record<string, string> = { ...CSRF };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body, credentials: "same-origin", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Can't reach the VELQIN server. Check your connection.");
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new CustomEvent("velqin:unauthorized"));
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Upload with progress (XHR, because fetch has no upload progress). */
export function upload<T = unknown>(path: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Velqin-Request", "1");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, data?.detail || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, "Upload failed — connection lost."));
    xhr.send(form);
  });
}
