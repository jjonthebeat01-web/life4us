"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { filterById, templateById } from "../../lib/content";
import type { SessionState } from "../../lib/types";

const CELL_W = 480;
const CELL_H = 320;
const GUTTER = 10;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderStrip(state: SessionState): Promise<HTMLCanvasElement> {
  const template = templateById(state.templateConfirmed);
  const filter = filterById(state.filterId);
  const canvas = document.createElement("canvas");
  const n = state.shots.length;
  canvas.width = CELL_W + GUTTER * 2;
  canvas.height = n * CELL_H + (n + 1) * GUTTER + 28;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = template.stripBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < n; i++) {
    const shot = state.shots[i];
    const y = GUTTER + i * (CELL_H + GUTTER);
    ctx.fillStyle = template.swatch;
    ctx.fillRect(GUTTER, y, CELL_W, CELL_H);

    const frames = Object.values(shot.frames);
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, y, CELL_W, CELL_H);
    ctx.clip();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).filter = filter.css;

    if (frames.length >= 2) {
      const [imgA, imgB] = await Promise.all([loadImage(frames[0]), loadImage(frames[1])]);
      const half = CELL_W / 2;
      drawCover(ctx, imgA, GUTTER, y, half, CELL_H);
      drawCover(ctx, imgB, GUTTER + half, y, half, CELL_H);
    } else if (frames.length === 1) {
      const img = await loadImage(frames[0]);
      drawCover(ctx, img, GUTTER, y, CELL_W, CELL_H);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).filter = "none";
    ctx.restore();
  }

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
