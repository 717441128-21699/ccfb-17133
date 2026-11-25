// 浏览器内“直接烧进视频”：
// Canvas 逐帧绘制 视频/戏台背景 + 双语字幕，canvas.captureStream 视频轨与
// Web Audio 的 MediaStreamDestination 音频轨合并，MediaRecorder 实时录成 WebM/MP4。

import type { Cue, SubtitleOptions } from '../types';
import { wrapLine } from '../lib/text';
import { player } from './player';

export interface BurnOptions {
  cues: Cue[];
  subtitle: SubtitleOptions;
  width: number;
  height: number;
  videoUrl?: string | null;
  /** 0 = 全片；>0 只烧前 N 秒（快速预览） */
  limitSec?: number;
  title?: string;
  onProgress?: (p: number) => void;
}

export interface BurnResult {
  blob: Blob;
  ext: 'webm' | 'mp4';
  mimeType: string;
}

export function pickRecorderMime(): { mimeType: string; ext: 'webm' | 'mp4' } {
  const candidates = [
    { m: 'video/webm;codecs=vp9,opus', e: 'webm' as const },
    { m: 'video/webm;codecs=vp8,opus', e: 'webm' as const },
    { m: 'video/webm', e: 'webm' as const },
    { m: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', e: 'mp4' as const },
    { m: 'video/mp4', e: 'mp4' as const },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.m)) return { mimeType: c.m, ext: c.e };
  }
  return { mimeType: '', ext: 'webm' };
}

export async function burnToVideo(opts: BurnOptions): Promise<BurnResult> {
  const { width, height } = opts;
  const duration = player.duration();
  const stopAt = opts.limitSec && opts.limitSec > 0 ? Math.min(opts.limitSec, duration) : duration;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.burnLive = '1';
  (window as unknown as { __burnCanvas?: HTMLCanvasElement }).__burnCanvas = canvas;
  const ctx = canvas.getContext('2d')!;

  // 可选视频画面
  let video: HTMLVideoElement | null = null;
  if (opts.videoUrl) {
    video = document.createElement('video');
    video.src = opts.videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      video!.onloadedmetadata = () => resolve();
      video!.onerror = () => reject(new Error('视频载入失败'));
    });
    try {
      video.currentTime = 0;
      await video.play();
    } catch {
      /* 自动播放被拒时首帧仍可绘制 */
    }
  }

  const actx = player.ensureContext();
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = player.buffer;
  src.connect(actx.destination);
  src.connect(dest);

  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const picked = pickRecorderMime();
  const rec = new MediaRecorder(combined, picked.mimeType ? { mimeType: picked.mimeType, videoBitsPerSecond: 5_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: picked.mimeType || 'video/webm' }));
  });

  const startCtxTime = actx.currentTime + 0.12;
  src.start(startCtxTime, 0, stopAt + 0.2);
  rec.start(250);

  // 用墙钟驱动画面进度，避免 AudioContext 被浏览器挂起时 currentTime 不走
  const wallStart = performance.now() + 120;
  await new Promise<void>((resolve) => {
    let raf = 0;
    const draw = () => {
      const t = Math.max(0, (performance.now() - wallStart) / 1000);
      drawFrame(ctx, opts, width, height, t, video);
      opts.onProgress?.(Math.min(1, t / stopAt));
      if (t >= stopAt + 0.05) {
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  try {
    src.stop();
  } catch {
    /* already stopped */
  }
  if (video) video.pause();
  rec.stop();
  const blob = await stopped;
  return { blob, ext: picked.ext, mimeType: picked.mimeType || 'video/webm' };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  opts: BurnOptions,
  W: number,
  H: number,
  t: number,
  video: HTMLVideoElement | null,
) {
  if (video && video.readyState >= 2 && video.videoWidth) {
    // cover 绘制
    const vr = video.videoWidth / video.videoHeight;
    const cr = W / H;
    let dw = W;
    let dh = H;
    if (vr > cr) {
      dh = H;
      dw = H * vr;
    } else {
      dw = W;
      dh = W / vr;
    }
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4a160e');
    g.addColorStop(0.55, '#2c0d08');
    g.addColorStop(1, '#1a0704');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.34, 40, W / 2, H * 0.34, H * 0.7);
    glow.addColorStop(0, 'rgba(230,180,90,0.28)');
    glow.addColorStop(1, 'rgba(230,180,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // 金色边框
    ctx.strokeStyle = 'rgba(214,178,96,0.75)';
    ctx.lineWidth = Math.max(2, H * 0.006);
    ctx.strokeRect(W * 0.035, H * 0.05, W * 0.93, H * 0.9);
    ctx.strokeStyle = 'rgba(214,178,96,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W * 0.045, H * 0.065, W * 0.91, H * 0.87);
    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9cd85';
    ctx.font = `700 ${Math.round(H * 0.075)}px "Noto Serif SC","SimSun",serif`;
    ctx.fillText(opts.title ?? '皮影戏', W / 2, H * 0.34);
    ctx.font = `${Math.round(H * 0.028)}px "Microsoft YaHei",sans-serif`;
    ctx.fillStyle = 'rgba(233,205,133,0.7)';
    ctx.fillText('— 非遗皮影 · 影戏字幕工坊烧录 —', W / 2, H * 0.42);
  }

  // 当前 cue
  const cue = opts.cues.find(
    (c) => c.exportEnabled !== false && !(c.missingLine && !opts.subtitle.exportMissingLines) && t >= c.start && t <= c.end,
  );
  if (!cue) return;

  const max = opts.subtitle.maxCharsPerLine;
  const dialectLines = wrapLine(cue.dialect, max);
  const mandarinLines = opts.subtitle.showMandarin && cue.mandarin ? wrapLine(cue.mandarin, max + 6) : [];

  const dSize = Math.round(H * 0.062);
  const mSize = Math.round(H * 0.036);
  const lineH = dSize * 1.34;
  const mLineH = mSize * 1.4;
  const bottom = H * 0.075;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // 普通话（最下面）
  let y = H - bottom;
  ctx.font = `500 ${mSize}px "Microsoft YaHei",sans-serif`;
  for (let i = mandarinLines.length - 1; i >= 0; i--) {
    drawOutlinedText(ctx, mandarinLines[i], W / 2, y, mSize, 'rgba(226,238,247,0.96)', 'rgba(10,8,4,0.9)', mSize * 0.12);
    y -= mLineH;
  }
  if (mandarinLines.length) y -= dSize * 0.28;
  // 方言
  ctx.font = `700 ${dSize}px "Noto Serif SC","SimSun",serif`;
  for (let i = dialectLines.length - 1; i >= 0; i--) {
    drawOutlinedText(ctx, dialectLines[i], W / 2, y, dSize, '#fff8e6', 'rgba(20,8,4,0.95)', dSize * 0.1);
    y -= lineH;
  }
}

function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string,
  width: number,
) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width * 2.2;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  void size;
}
