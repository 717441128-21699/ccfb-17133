// Canvas 波形组件：峰值波形 + 过门阴影 + cue 色块 + 可拖拽左右边界 + 播放头。
// 静态层与播放头层分离，rAF 只重绘覆盖层；试听全部走 Web Audio API。

import type { AlignResult, Cue } from '../../types';
import { player } from '../../audio/player';
import { h } from '../dom';
import { toUiTime, clamp } from '../../lib/text';

export interface WaveformHandle {
  el: HTMLElement;
  redraw: () => void;
  zoomBy: (factor: number) => void;
  destroy: () => void;
  scrollToTime: (t: number) => void;
  timeToX: (t: number) => number;
}

interface Opts {
  cues: () => Cue[];
  result: () => AlignResult | null;
  selectedId: () => string | null;
  onSelect: (id: string | null) => void;
  onBoundaryChange: (id: string, start: number, end: number, commit: boolean) => void;
}

const H = 168;
const RULER = 24;
const WAVE_BOTTOM = 120;
const LANE_Y = 128;
const LANE_H = 32;
const HIT_PX = 9;
const BUCKETS = 9000;

export function createWaveform(opts: Opts): WaveformHandle {
  const duration = player.duration() || opts.result()?.duration || 1;

  const scroll = h('div', { class: 'wave-scroll' }) as HTMLDivElement;
  const wrap = h('div', { class: 'wave-canvas-wrap' }) as HTMLDivElement;
  wrap.style.height = `${H}px`;
  const base = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  base.style.position = overlay.style.position = 'absolute';
  base.style.inset = overlay.style.inset = '0';
  overlay.style.touchAction = 'none';
  wrap.append(base, overlay);
  scroll.append(wrap);

  let viewW = scroll.clientWidth || 1200;
  let pps = Math.max(6, (viewW - 4) / duration);
  let cssW = Math.max(viewW - 2, duration * pps);

  /* ---------- 峰值 ---------- */
  const pMin = new Float32Array(BUCKETS);
  const pMax = new Float32Array(BUCKETS);
  const buf = player.buffer;
  if (buf) {
    const d0 = buf.getChannelData(0);
    const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
    const block = Math.floor(d0.length / BUCKETS) || 1;
    for (let b = 0; b < BUCKETS; b++) {
      let mn = 1;
      let mx = -1;
      const a = b * block;
      const stride = Math.max(1, Math.floor(block / 220));
      for (let i = a; i < Math.min(a + block, d0.length); i += stride) {
        const v = (d0[i] + d1[i]) * 0.5;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      pMin[b] = mn;
      pMax[b] = mx;
    }
  }

  function resizeCanvases() {
    cssW = Math.max(viewW - 2, Math.round(duration * pps));
    wrap.style.width = `${cssW}px`;
    for (const c of [base, overlay]) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.width = `${cssW}px`;
      c.style.height = `${H}px`;
      c.width = Math.round(cssW * dpr);
      c.height = H * dpr;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  const x = (t: number) => t * pps;
  const tAt = (clientX: number) => {
    const r = overlay.getBoundingClientRect();
    return clamp((clientX - r.left) / pps, 0, duration);
  };

  function drawBase() {
    const ctx = base.getContext('2d')!;
    ctx.clearRect(0, 0, cssW, H);
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1e10');
    bg.addColorStop(1, '#1b1208');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, H);

    /* 过门阴影 */
    const result = opts.result();
    if (result) {
      for (const it of result.interludes) {
        const ix = x(it.start);
        const iw = Math.max(2, x(it.end) - ix);
        const g = ctx.createLinearGradient(0, RULER, 0, H);
        g.addColorStop(0, 'rgba(214,164,66,0.10)');
        g.addColorStop(1, 'rgba(214,164,66,0.26)');
        ctx.fillStyle = g;
        ctx.fillRect(ix, RULER, iw, H - RULER);
        ctx.strokeStyle = 'rgba(230,196,110,0.5)';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(ix, RULER);
        ctx.lineTo(ix, H);
        ctx.moveTo(ix + iw, RULER);
        ctx.lineTo(ix + iw, H);
        ctx.stroke();
        ctx.setLineDash([]);
        if (iw > 64) {
          ctx.fillStyle = 'rgba(240,214,150,0.85)';
          ctx.font = '12px "Microsoft YaHei", sans-serif';
          ctx.fillText(`🥁 ${it.label}`, ix + 7, RULER + 15);
        }
      }
    }

    /* 时间刻度 */
    drawRuler(ctx);

    /* 波形 */
    const mid = (RULER + WAVE_BOTTOM) / 2 + 6;
    const amp = (WAVE_BOTTOM - RULER) / 2 - 4;
    ctx.fillStyle = 'rgba(214,178,96,0.28)';
    ctx.fillRect(0, mid, cssW, 1);
    for (let px = 0; px < cssW; px++) {
      const t = px / pps;
      const b = Math.min(BUCKETS - 1, Math.floor((t / duration) * BUCKETS));
      const lo = pMin[b] ?? 0;
      const hi = pMax[b] ?? 0;
      const y1 = mid - hi * amp;
      const y2 = mid - lo * amp;
      const grad = ctx.createLinearGradient(0, y1, 0, y2);
      grad.addColorStop(0, '#e7c877');
      grad.addColorStop(0.5, '#c79a44');
      grad.addColorStop(1, '#8a6426');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, y1);
      ctx.lineTo(px + 0.5, Math.max(y1 + 1, y2));
      ctx.stroke();
    }

    /* cue 色块 */
    const selected = opts.selectedId();
    for (const cue of opts.cues()) {
      const cx = x(cue.start);
      const cw = Math.max(3, x(cue.end) - cx);
      const isSel = cue.id === selected;
      let color = cue.kind === 'sing' ? '178,58,44' : '47,125,99';
      if (cue.missingLine) color = '217,154,22';
      ctx.fillStyle = `rgba(${color},${cue.missingLine ? 0.42 : isSel ? 0.5 : 0.26})`;
      roundRect(ctx, cx, LANE_Y, cw, LANE_H, 7);
      ctx.fill();
      ctx.lineWidth = isSel ? 2 : 1.2;
      ctx.strokeStyle = isSel ? '#f3d27a' : `rgba(${color},0.95)`;
      ctx.stroke();
      // 左右手柄
      ctx.fillStyle = isSel ? '#f6dd9a' : `rgba(${color},1)`;
      ctx.fillRect(cx - 1.5, LANE_Y + 5, 3, LANE_H - 10);
      ctx.fillRect(cx + cw - 1.5, LANE_Y + 5, 3, LANE_H - 10);
      // 文本
      if (cw > 44) {
        ctx.fillStyle = cue.missingLine ? '#4a3404' : '#fdf3dd';
        ctx.font = '600 12.5px "Noto Serif SC","Microsoft YaHei",serif';
        const label = cue.dialect.replace(/\s/g, '');
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, cx + 4, LANE_Y + 2, cw - 8, LANE_H - 4, 5);
        ctx.clip();
        ctx.fillText(label, cx + 8, LANE_Y + 20, cw - 14);
        ctx.restore();
      }
      // 选中 cue 的逐字边界
      if (isSel) {
        const charMap = new Map((opts.result()?.chars ?? []).map((c) => [c.id, c]));
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        for (const cid of cue.charIds) {
          const c = charMap.get(cid);
          if (!c) continue;
          const bx = x(c.end);
          ctx.beginPath();
          ctx.moveTo(bx, RULER + 4);
          ctx.lineTo(bx, WAVE_BOTTOM + 4);
          ctx.stroke();
        }
      }
    }
  }

  function drawRuler(ctx: CanvasRenderingContext2D) {
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
    let interval = 60;
    for (const c of candidates) {
      if (c * pps >= 92) {
        interval = c;
        break;
      }
    }
    ctx.fillStyle = '#241a0e';
    ctx.fillRect(0, 0, cssW, RULER);
    ctx.strokeStyle = '#4a3820';
    ctx.beginPath();
    ctx.moveTo(0, RULER - 0.5);
    ctx.lineTo(cssW, RULER - 0.5);
    ctx.stroke();
    ctx.fillStyle = '#cbb37e';
    ctx.font = '11.5px ui-monospace, Consolas, monospace';
    const first = Math.floor(duration / interval);
    for (let k = 0; k <= first + 1; k++) {
      const t = k * interval;
      if (t > duration + interval) break;
      const tx = x(t);
      ctx.strokeStyle = '#5d4726';
      ctx.beginPath();
      ctx.moveTo(tx + 0.5, RULER - 6);
      ctx.lineTo(tx + 0.5, RULER);
      ctx.stroke();
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, tx + 5, 15);
    }
  }

  let drag:
    | { mode: 'start' | 'end' | 'scrub'; cueId?: string; moved: boolean }
    | null = null;

  function hitBoundary(clientX: number): { id: string; side: 'start' | 'end' } | null {
    const t = tAt(clientX);
    const cues = opts.cues();
    const sel = opts.selectedId();
    // 优先选中 cue
    const ordered = [...cues].sort((a, b) => (a.id === sel ? -1 : b.id === sel ? 1 : 0));
    for (const cue of ordered) {
      if (Math.abs(t - cue.start) * pps <= HIT_PX) return { id: cue.id, side: 'start' };
      if (Math.abs(t - cue.end) * pps <= HIT_PX) return { id: cue.id, side: 'end' };
    }
    return null;
  }

  function snap(t: number): number {
    const res = opts.result();
    if (!res) return t;
    let best = t;
    let bestD = 8 / pps;
    const candidates: number[] = [];
    for (const s of res.segments) candidates.push(s.start, s.end);
    for (const c of opts.cues()) candidates.push(c.start, c.end);
    for (const ct of candidates) {
      const d = Math.abs(ct - t);
      if (d < bestD) {
        bestD = d;
        best = ct;
      }
    }
    return best;
  }

  overlay.addEventListener('pointerdown', (e: PointerEvent) => {
    overlay.setPointerCapture(e.pointerId);
    const hit = hitBoundary(e.clientX);
    if (hit) {
      opts.onSelect(hit.id);
      drag = { mode: hit.side, cueId: hit.id, moved: false };
    } else {
      const t = tAt(e.clientX);
      const cue = opts.cues().find((c) => t >= c.start && t <= c.end);
      if (cue) opts.onSelect(cue.id);
      drag = { mode: 'scrub', moved: true };
      player.seek(snap(t));
    }
  });

  overlay.addEventListener('pointermove', (e: PointerEvent) => {
    const t = snap(tAt(e.clientX));
    if (!drag) {
      const hit = hitBoundary(e.clientX);
      overlay.style.cursor = hit ? 'ew-resize' : 'crosshair';
      return;
    }
    drag.moved = true;
    if (drag.mode === 'scrub') {
      player.seek(t);
      return;
    }
    const cue = opts.cues().find((c) => c.id === drag!.cueId);
    if (!cue) return;
    if (drag.mode === 'start') {
      const ns = clamp(Math.min(t, cue.end - 0.25), 0, duration - 0.25);
      opts.onBoundaryChange(cue.id, ns, cue.end, false);
    } else {
      const ne = clamp(Math.max(t, cue.start + 0.25), 0.25, duration);
      opts.onBoundaryChange(cue.id, cue.start, ne, false);
    }
    drawBase();
  });

  const endDrag = () => {
    if (drag?.cueId && (drag.mode === 'start' || drag.mode === 'end')) {
      const cue = opts.cues().find((c) => c.id === drag!.cueId);
      if (cue) opts.onBoundaryChange(cue.id, cue.start, cue.end, true);
    }
    drag = null;
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  /* 播放头覆盖层 */
  const octx = overlay.getContext('2d')!;
  let raf = 0;
  function drawOverlay() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, cssW, H);
    const t = player.getTime();
    const px = x(t);
    octx.strokeStyle = '#fff3cf';
    octx.lineWidth = 1.6;
    octx.beginPath();
    octx.moveTo(px, 0);
    octx.lineTo(px, H);
    octx.stroke();
    octx.fillStyle = '#fff3cf';
    octx.beginPath();
    octx.moveTo(px - 6, 0);
    octx.lineTo(px + 6, 0);
    octx.lineTo(px, 8);
    octx.closePath();
    octx.fill();
    raf = requestAnimationFrame(drawOverlay);
  }

  const unsubTick = player.onTick((t) => {
    if (player.playing) {
      const sl = scroll.scrollLeft;
      const vw = scroll.clientWidth;
      const px = x(t);
      if (px < sl + 30 || px > sl + vw - 50) {
        scroll.scrollLeft = Math.max(0, px - 90);
      }
    }
  });

  const ro = new ResizeObserver(() => {
    const firstFit = viewW === 1200;
    viewW = scroll.clientWidth || viewW;
    if (firstFit && scroll.clientWidth > 0) {
      pps = Math.max(6, (viewW - 4) / duration);
    }
    resizeCanvases();
    drawBase();
  });
  ro.observe(scroll);

  resizeCanvases();
  drawBase();
  drawOverlay();

  return {
    el: scroll,
    redraw: drawBase,
    zoomBy(factor: number) {
      const rect = scroll.getBoundingClientRect();
      const centerT = (scroll.scrollLeft + rect.width / 2) / pps;
      pps = clamp(pps * factor, 2, 420);
      resizeCanvases();
      drawBase();
      scroll.scrollLeft = centerT * pps - rect.width / 2;
    },
    scrollToTime(t: number) {
      scroll.scrollLeft = clamp(x(t) - 120, 0, cssW);
    },
    timeToX(t: number) {
      return x(t);
    },
    destroy() {
      cancelAnimationFrame(raf);
      unsubTick();
      ro.disconnect();
    },
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x0 + rr, y0);
  ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, rr);
  ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, rr);
  ctx.arcTo(x0, y0 + h, x0, y0, rr);
  ctx.arcTo(x0, y0, x0 + w, y0, rr);
  ctx.closePath();
}

export { toUiTime };
