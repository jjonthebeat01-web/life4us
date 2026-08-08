"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { filterById, formatById, templateById } from "../../lib/content";
import type { SessionState } from "../../lib/types";

// Everything below is defined at "logical" size, then multiplied by SCALE when
// actually drawn — keeps proportions/layout math readable while the real
// output is high-resolution. Previously the whole strip (borders, footer
// text, everything) was composited at ~500px wide total, which is why
// *everything* looked soft, not just the camera photos — there simply wasn't
// enough pixel data in the canvas itself, regardless of source photo quality.
const SCALE = 3;
const QUALITY = 0.96; // was 0.92 — less compression softness

const STRIP_W = 480; // total strip width stays constant across formats, like a real photobooth strip
// 320 produced a 4-row strip at ~1:2.77 (500x1386px) — taller than even the
// tallest common phone screens (~1:2.17), so "fit to screen" in a gallery app
// couldn't show the whole thing without scrolling. 260 brings a 4-row strip to
// ~1:2.29 (500x1146px), which fits comfortably on virtually all modern phones.
const CELL_H = 260;
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
  const format = formatById(state.formatConfirmed);
  const { cols, rows } = format;
  const cellW = ((STRIP_W - GUTTER * (cols - 1)) / cols) * SCALE;
  const cellH = CELL_H * SCALE;
  const gutter = GUTTER * SCALE;
  const footerH = FOOTER_H * SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = (STRIP_W + GUTTER * 2) * SCALE;
  canvas.height = rows * cellH + (rows + 1) * gutter + footerH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = template.stripBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < state.shots.length; i++) {
    const shot = state.shots[i];
    // Grid position from format's cols/rows — was previously ignored
    // entirely, which is why 2x4 rendered as a single stacked column
    // instead of two side by side.
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gutter + col * (cellW + gutter);
    const y = gutter + row * (cellH + gutter);

    ctx.fillStyle = template.swatch;
    ctx.fillRect(x, y, cellW, cellH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellW, cellH);
    ctx.clip();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).filter = filter.css;

    if (shot.photo) {
      const img = await loadImage(shot.photo);
      drawCover(ctx, img, x, y, cellW, cellH);
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
  const footerY = canvas.height - footerH;
  const centerX = canvas.width / 2;

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `italic 600 ${26 * SCALE}px "Fraunces", Georgia, serif`;
  ctx.fillText("life4us", centerX, footerY + 30 * SCALE);

  ctx.font = `${11 * SCALE}px "IBM Plex Mono", "Space Mono", monospace`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(`${formatStripDate(state.createdAt)}  ·  ${state.code}`, centerX, footerY + 46 * SCALE);
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
      setDataUrl(canvas.toDataURL("image/jpeg", QUALITY));
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
    }, "image/jpeg", QUALITY);
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