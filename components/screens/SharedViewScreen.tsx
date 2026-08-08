"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { filterById, templateById } from "../../lib/content";
import type { SessionState } from "../../lib/types";

const CELL_W = 480;
const CELL_H = 320;
const GUTTER = 10;
const FOOTER_H = 56; // was reserved as `+ 28` but nothing was ever drawn into it

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatStripDate(ts: number): string {
  return new Date(ts)
    .toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\//g, ".");
}

async function renderStrip(state: SessionState): Promise<HTMLCanvasElement> {
  const template = templateById(state.templateConfirmed);
  const filter = filterById(state.filterId);
  const canvas = document.createElement("canvas");
  const n = state.shots.length;
  canvas.width = CELL_W + GUTTER * 2;
  canvas.height = n * CELL_H + (n + 1) * GUTTER + FOOTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = template.stripBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < n; i++) {
    const shot = state.shots[i];
    const y = GUTTER + i * (CELL_H + GUTTER);
    ctx.fillStyle = template.swatch;
    ctx.fillRect(GUTTER, y, CELL_W, CELL_H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, y, CELL_W, CELL_H);
    ctx.clip();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).filter = filter.css;

    if (shot.photo) {
      const img = await loadImage(shot.photo);
      drawCover(ctx, img, GUTTER, y, CELL_W, CELL_H);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).filter = "none";
    ctx.restore();
  }

  // Footer — our wordmark in the theme-colored bottom tab, same role a real
  // photobooth strip's brand mark plays, plus a small date/code line as our
  // equivalent of a serial number. Wait for the display font to actually be
  // loaded so this doesn't silently fall back to a generic serif.
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // draw anyway with whatever's loaded rather than block the strip
    }
  }
  const footerY = canvas.height - FOOTER_H;
  const centerX = canvas.width / 2;

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = 'italic 600 26px "Fraunces", Georgia, serif';
  ctx.fillText("life4us", centerX, footerY + 30);

  ctx.font = '11px "IBM Plex Mono", "Space Mono", monospace';
  ctx.globalAlpha = 0.75;
  ctx.fillText(`${formatStripDate(state.createdAt)}  ·  ${state.code}`, centerX, footerY + 46);
  ctx.globalAlpha = 1;

  return canvas;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function SharedViewScreen({ state }: { state: SessionState }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const canvasCacheRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    renderStrip(state).then((canvas) => {
      if (!active) return;
      canvasCacheRef.current = canvas;
      setDataUrl(canvas.toDataURL("image/jpeg", 0.92));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.filterId, state.templateConfirmed, JSON.stringify(state.shots.map((s) => s.lockedAt))]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `strip-${state.code}.jpg`;
    a.click();
  }

  async function share() {
    const canvas = canvasCacheRef.current;
    if (!canvas || !navigator.share) {
      download();
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `strip-${state.code}.jpg`, { type: "image/jpeg" });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Our photo strip" });
          return;
        }
      } catch {
        // fall through to download
      }
      download();
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="flex flex-col items-center text-center gap-1 w-full">
      <h1 className="font-display text-2xl text-paper mb-1">your strip is ready</h1>
      <p className="text-mist text-sm mb-6 font-utility">saved for both of you</p>

      <div className="rounded-lg overflow-hidden border border-white/10 mb-6 bg-black/30 p-2">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="Your photo strip" className="w-[180px]" />
        ) : (
          <div className="w-[180px] h-[420px] flex items-center justify-center text-mist text-xs font-utility">
            printing…
          </div>
        )}
      </div>

      <div className="w-full flex flex-col gap-3">
        <Button onClick={download}>Download</Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={share}>
            Share
          </Button>
          <Button variant="secondary" onClick={download}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}