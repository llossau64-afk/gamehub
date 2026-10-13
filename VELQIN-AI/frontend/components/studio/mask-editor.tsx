"use client";
import { Brush, Eraser, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/misc";

/** Paint the area to regenerate (white = change). Returns a PNG data URL at the image's natural size. */
export function MaskEditor({ open, src, onClose, onDone }: { open: boolean; src: string | null; onClose: () => void; onDone: (maskDataUrl: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState(48);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) setNatural(null);
  }, [open]);

  function setup() {
    const el = img.current;
    const c = canvas.current;
    if (!el || !c) return;
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
  }

  function pos(e: React.PointerEvent) {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, scale: c.width / r.width };
  }
  function stroke(e: React.PointerEvent) {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const p = pos(e);
    ctx.globalCompositeOperation = tool === "brush" ? "source-over" : "destination-out";
    ctx.strokeStyle = "rgba(167,139,250,0.85)";
    ctx.fillStyle = "rgba(167,139,250,0.85)";
    ctx.lineWidth = size * p.scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (last.current) {
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.arc(p.x, p.y, (size * p.scale) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    last.current = p;
  }
  function exportMask() {
    const c = canvas.current!;
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, out.width, out.height);
    // convert painted alpha into a white mask
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    const res = ctx.getImageData(0, 0, out.width, out.height);
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i + 3] > 20) {
        res.data[i] = res.data[i + 1] = res.data[i + 2] = 255;
      }
    }
    ctx.putImageData(res, 0, 0);
    onDone(out.toDataURL("image/png"));
  }

  return (
    <Dialog open={open} onClose={onClose} wide title="Paint the area to change" description="Everything you paint is regenerated from your prompt — e.g. paint the background to replace it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={exportMask} disabled={!natural}>Use mask</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented value={tool} onChange={setTool} options={[{ value: "brush", label: <span className="flex items-center gap-1.5"><Brush className="h-3.5 w-3.5" />Brush</span> }, { value: "eraser", label: <span className="flex items-center gap-1.5"><Eraser className="h-3.5 w-3.5" />Eraser</span> }]} />
        <label className="flex items-center gap-2 text-xs text-muted">Size<input type="range" min={8} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-[var(--accent)]" /></label>
        <Button size="sm" variant="ghost" onClick={() => { const c = canvas.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }}><RotateCcw className="h-3.5 w-3.5" />Clear</Button>
      </div>
      {src && (
        <div className="relative mx-auto w-fit max-w-full touch-none select-none overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={img} src={src} alt="" onLoad={setup} className="block max-h-[60dvh] max-w-full" draggable={false} />
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full cursor-crosshair"
            onPointerDown={(e) => { drawing.current = true; last.current = null; (e.target as HTMLElement).setPointerCapture(e.pointerId); stroke(e); }}
            onPointerMove={(e) => drawing.current && stroke(e)}
            onPointerUp={() => { drawing.current = false; last.current = null; }}
            onPointerCancel={() => { drawing.current = false; last.current = null; }}
          />
        </div>
      )}
    </Dialog>
  );
}
