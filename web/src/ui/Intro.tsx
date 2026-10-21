// Neon launch intro: the portrait glitches in while a neon bar fills, then the sign flickers on.
// Canvas port of the Android launch intro. Tap to skip; reduced motion shows the final frame.
// Licensed under GPL-3.0.
import { useEffect, useRef } from 'preact/hooks';
import {
  LIT_MS, LOAD_MS, NEON_CYAN, NEON_PINK, PINK_CORE, SIGN_START_MS, SIGN_TOP,
  glitchIntensity, loadProgress, loadingUiAlpha, seeded, tubeAlpha,
} from '../core/intro';

const FONT = '"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive';
const END_MS = LIT_MS + 450;

function channelCanvas(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function Intro({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    let raf = 0;
    let start = 0;
    let channels: HTMLCanvasElement[] = [];
    const fallback = window.setTimeout(finish, reduced ? 1200 : END_MS + 1500);

    const frame = (now: number) => {
      if (!ctx) return finish();
      if (!start) start = now;
      const t = reduced ? LIT_MS : now - start;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const side = Math.min(w, h);
      const fx = (w - side) / 2;
      const fy = (h - side) / 2;
      const p = loadProgress(t);
      drawPortrait(ctx, img, channels, fx, fy, side, glitchIntensity(t, p), t);
      const ui = loadingUiAlpha(t);
      if (ui > 0) drawLoadingUi(ctx, fx, fy, side, p, ui, Math.max(0, LOAD_MS - t));
      const sign = tubeAlpha(t - SIGN_START_MS);
      if (sign > 0) drawSign(ctx, img, fx, fy, side, sign);
      if (t >= (reduced ? LIT_MS : END_MS)) {
        window.setTimeout(finish, reduced ? 600 : 0);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    img.onload = () => {
      channels = reduced ? [] : ['#ff0000', '#00ff00', '#0000ff'].map((c) => channelCanvas(img, c));
      raf = requestAnimationFrame(frame);
    };
    img.onerror = finish;
    img.src = './sneaky_alpha_art.jpg';
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [onDone]);

  return (
    <div class="intro" role="img" aria-label="0x Sneaky Alpha loading" data-testid="intro"
      onClick={() => { if (!doneRef.current) { doneRef.current = true; onDone(); } }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function drawPortrait(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, channels: HTMLCanvasElement[],
  fx: number, fy: number, side: number, glitch: number, t: number,
) {
  const ih = img.naturalHeight;
  const iw = img.naturalWidth;
  const splitY = ih * SIGN_TOP;
  if (glitch <= 0 || channels.length !== 3) {
    ctx.drawImage(img, 0, 0, iw, splitY, fx, fy, side, side * SIGN_TOP);
    return;
  }
  const bands = 28;
  const seed = Math.floor(t / 55);
  const shift = glitch * side * 0.04;
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, side, side * SIGN_TOP);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < bands; b++) {
    const sy0 = Math.floor((splitY * b) / bands);
    const sy1 = Math.floor((splitY * (b + 1)) / bands);
    const dy = fy + (side * sy0) / ih;
    const dh = (side * (sy1 - sy0)) / ih + 1;
    const tear = seeded(seed, b * 3) < glitch * 0.6 ? (seeded(seed, b * 3 + 1) * 2 - 1) * glitch * side * 0.18 : 0;
    const dropout = glitch > 0.5 && seeded(seed, b * 3 + 2) < 0.07;
    ctx.globalAlpha = dropout ? 0.2 : 1;
    const offsets = [-shift, 0, shift];
    channels.forEach((ch, i) => ctx.drawImage(ch, 0, sy0, iw, sy1 - sy0, fx + tear + offsets[i], dy, side, dh));
  }
  ctx.restore();
  if (glitch > 0.05) {
    const lines = 5 + Math.floor(glitch * 12);
    ctx.save();
    for (let i = 0; i < lines; i++) {
      const y = fy + seeded(seed, 100 + i) * side * SIGN_TOP;
      ctx.globalAlpha = glitch * 0.6;
      ctx.strokeStyle = seeded(seed, 200 + i) < 0.5 ? NEON_PINK : NEON_CYAN;
      ctx.lineWidth = 1 + seeded(seed, 300 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(fx, y);
      ctx.lineTo(fx + side, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSign(ctx: CanvasRenderingContext2D, img: HTMLImageElement, fx: number, fy: number, side: number, alpha: number) {
  const sy = img.naturalHeight * SIGN_TOP;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, 0, sy, img.naturalWidth, img.naturalHeight - sy, fx, fy + side * SIGN_TOP, side, side * (1 - SIGN_TOP));
  ctx.restore();
}

function drawLoadingUi(
  ctx: CanvasRenderingContext2D, fx: number, fy: number, side: number, p: number, alpha: number, remainingMs: number,
) {
  const u = side / 1024;
  const cx = fx + side / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PINK_CORE;
  ctx.shadowColor = NEON_PINK;
  ctx.shadowBlur = 22 * u;
  let px = 54 * u;
  const title = `0x Sneaky Alpha Loading... ${Math.floor(p * 100)}%`;
  ctx.font = `italic bold ${px}px ${FONT}`;
  const tw = ctx.measureText(title).width;
  if (tw > side * 0.94) {
    px *= (side * 0.94) / tw;
    ctx.font = `italic bold ${px}px ${FONT}`;
  }
  ctx.fillText(title, cx, fy + 755 * u);
  // Bar frame with a soft cyan glow.
  const bx = fx + 82 * u;
  const by = fy + 838 * u;
  const bw = side - 164 * u;
  const bh = 68 * u;
  ctx.shadowBlur = 0;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.strokeStyle = NEON_CYAN;
  ctx.globalAlpha = 0.25 * alpha;
  ctx.lineWidth = 14 * u;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 4 * u;
  ctx.stroke();
  const segments = 24;
  const pad = 16 * u;
  const gap = 7 * u;
  const segW = (bw - pad * 2 - gap * (segments - 1)) / segments;
  const filled = Math.floor(p * segments);
  for (let i = 0; i < filled; i++) {
    ctx.fillStyle = i >= filled - 4 && p < 1 ? NEON_CYAN : NEON_PINK;
    roundRect(ctx, bx + pad + i * (segW + gap), by + 14 * u, segW, bh - 28 * u, 4 * u);
    ctx.fill();
  }
  ctx.font = `italic ${34 * u}px ${FONT}`;
  ctx.fillStyle = PINK_CORE;
  ctx.shadowColor = NEON_PINK;
  ctx.shadowBlur = 12 * u;
  ctx.fillText('Initializing Data Stream...', cx, fy + 920 * u);
  ctx.fillText(`ETA: ${(remainingMs / 1000).toFixed(1)}s`, cx, fy + 962 * u);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
