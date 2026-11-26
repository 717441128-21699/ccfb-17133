import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { audioEngine } from '../audio/AudioEngine';
import { computePeaks, mixToMono } from '../audio/bufferUtils';
import { toEditTime } from '../utils/time';
import type { AlignmentResult, Show } from '../types/domain';

const WAVE_H = 150;
const RULER_H = 26;
const HIT = 7;

type DragMode =
  | { kind: 'start'; cueId: string }
  | { kind: 'end'; cueId: string }
  | { kind: 'move'; cueId: string; startX: number; origStart: number; moved: boolean }
  | { kind: 'scrub' }
  | null;

export function Waveform({ show, result }: { show: Show; result: AlignmentResult }) {
  const selectedCueId = useStore((s) => s.selectedCueId);
  const selectCue = useStore((s) => s.selectCue);
  const dragBoundary = useStore((s) => s.dragBoundary);
  const moveCue = useStore((s) => s.moveCue);

  const [pps, setPps] = useState(96);
  const [playing, setPlaying] = useState(false);
  const [hoverCursor, setHoverCursor] = useState('default');

  const scrollRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<DragMode>(null);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;

  const buffer = audioEngine.getBuffer(show.id);
  const duration = result.duration || buffer?.duration || 0;
  const widthPx = Math.max(600, Math.ceil(duration * pps));

  const peaks = useMemo(() => {
    const buf = audioEngine.getBuffer(show.id);
    if (!buf) return null;
    return computePeaks(mixToMono(buf), widthPx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, widthPx, audioEngine.hasBuffer(show.id)]);

  /* ------------ 绘制 ------------ */
  const draw = useCallback(() => {
    const canvas = waveCanvasRef.current;
    const ruler = rulerCanvasRef.current;
    if (!canvas || !ruler) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = widthPx * dpr;
    canvas.height = WAVE_H * dpr;
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${WAVE_H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthPx, WAVE_H);

    // 中线
    ctx.strokeStyle = 'rgba(236,220,184,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, WAVE_H / 2);
    ctx.lineTo(widthPx, WAVE_H / 2);
    ctx.stroke();

    // 过门背景
    for (const g of result.gaps) {
      const x = g.start * pps;
      const w = Math.max(2, (g.end - g.start) * pps);
      if (g.type === 'luogu') {
        ctx.fillStyle = 'rgba(201,74,55,0.20)';
        ctx.fillRect(x, 0, w, WAVE_H);
        ctx.fillStyle = 'rgba(231,120,96,0.5)';
        for (let hx = x + 6; hx < x + w - 4; hx += 12) {
          ctx.beginPath();
          ctx.moveTo(hx, 6);
          ctx.lineTo(hx + 5, 14);
          ctx.lineTo(hx, 22);
          ctx.lineTo(hx - 5, 14);
          ctx.closePath();
          ctx.fill();
        }
      } else if (g.type === 'instrumental') {
        ctx.fillStyle = 'rgba(192,138,45,0.16)';
        ctx.fillRect(x, 0, w, WAVE_H);
      } else {
        ctx.fillStyle = 'rgba(150,150,150,0.08)';
        ctx.fillRect(x, 0, w, WAVE_H);
      }
      // 标签
      if (w > 64) {
        ctx.font = '600 11px "Microsoft YaHei"';
        ctx.fillStyle = g.type === 'luogu' ? 'rgba(255,170,150,0.95)' : g.type === 'instrumental' ? 'rgba(233,200,119,0.95)' : 'rgba(200,200,200,0.7)';
        ctx.textAlign = 'left';
        ctx.fillText(g.label, x + 7, WAVE_H - 9);
      }
    }

    // 波形
    if (peaks) {
      const mid = WAVE_H / 2;
      for (let x = 0; x < peaks.buckets; x++) {
        const hi = Math.max(2, peaks.max[x] * (WAVE_H / 2 - 8));
        const lo = Math.max(2, -peaks.min[x] * (WAVE_H / 2 - 8));
        const inCue = result.cue.some((c) => x / pps >= c.start && x / pps <= c.end);
        ctx.fillStyle = inCue ? '#e8b45a' : '#8a6f45';
        ctx.fillRect(x, mid - hi, 1, hi + lo);
      }
    }

    // cue 区域
    for (const c of result.cue) {
      const x = c.start * pps;
      const w = Math.max(4, (c.end - c.start) * pps);
      const selected = c.id === selectedCueId;
      const speak = c.kind === 'speak';
      ctx.fillStyle = selected ? 'rgba(232,180,90,0.22)' : speak ? 'rgba(86,170,150,0.13)' : 'rgba(200,74,55,0.13)';
      ctx.fillRect(x, 0, w, WAVE_H);
      ctx.strokeStyle = selected ? '#ffd98a' : speak ? 'rgba(110,200,178,0.8)' : 'rgba(232,120,100,0.85)';
      ctx.lineWidth = selected ? 2 : 1.4;
      ctx.strokeRect(x + 0.5, 1, w - 1, WAVE_H - 2);
      // 拖拽手柄
      ctx.fillStyle = selected ? '#ffd98a' : 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 1.5, 0, 3, WAVE_H);
      ctx.fillRect(x + w - 1.5, 0, 3, WAVE_H);
      // 角色标签
      if (w > 46 && c.role) {
        ctx.font = '700 11px "Microsoft YaHei"';
        ctx.textAlign = 'left';
        ctx.fillStyle = selected ? '#ffe6b0' : 'rgba(236,220,184,0.85)';
        ctx.fillText(`${c.kind === 'sing' ? '唱' : '白'}·${c.role}`, x + 7, 16);
      }
    }

    /* 标尺 */
    ruler.width = widthPx * dpr;
    ruler.height = RULER_H * dpr;
    ruler.style.width = `${widthPx}px`;
    ruler.style.height = `${RULER_H}px`;
    const rctx = ruler.getContext('2d')!;
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.clearRect(0, 0, widthPx, RULER_H);
    rctx.fillStyle = '#241b12';
    rctx.fillRect(0, 0, widthPx, RULER_H);
    const step = pps < 40 ? 5 : pps < 90 ? 2 : pps < 170 ? 1 : 0.5;
    rctx.font = '10px Consolas, monospace';
    rctx.fillStyle = '#b79f72';
    rctx.strokeStyle = 'rgba(183,159,114,0.35)';
    rctx.lineWidth = 1;
    for (let t = 0; t <= duration; t += step) {
      const x = t * pps;
      rctx.beginPath();
      rctx.moveTo(x, RULER_H - 6);
      rctx.lineTo(x, RULER_H);
      rctx.stroke();
      rctx.fillText(toEditTime(t).slice(0, 5), x + 4, 12);
    }
  }, [widthPx, peaks, result, pps, selectedCueId, duration]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* ------------ 播放头 rAF ------------ */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = audioEngine.currentTime;
      if (headRef.current) headRef.current.style.transform = `translateX(${t * ppsRef.current}px)`;
      if (timeRef.current) timeRef.current.textContent = toEditTime(t);
      setPlaying(audioEngine.isPlaying(show.id));
      // 自动跟随滚动
      const el = scrollRef.current;
      if (el && audioEngine.isPlaying(show.id)) {
        const x = t * ppsRef.current;
        if (x > el.scrollLeft + el.clientWidth - 90) el.scrollLeft = x - 120;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show.id]);

  useEffect(() => () => audioEngine.pause(false), [show.id]);

  const togglePlay = async () => {
    if (audioEngine.isPlaying(show.id)) audioEngine.pause();
    else await audioEngine.play(show.id, audioEngine.currentTime >= duration - 0.05 ? 0 : undefined);
    setPlaying(audioEngine.isPlaying(show.id));
  };

  /* ------------ 指针命中 ------------ */
  const timeFromEvent = (e: React.PointerEvent): number => {
    const rect = waveCanvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(duration, x / ppsRef.current));
  };

  const hitTest = (t: number): DragMode => {
    for (const c of result.cue) {
      if (Math.abs(t - c.start) * pps <= HIT) return { kind: 'start', cueId: c.id };
      if (Math.abs(t - c.end) * pps <= HIT) return { kind: 'end', cueId: c.id };
    }
    for (const c of result.cue) {
      if (t >= c.start && t <= c.end)
        return { kind: 'move', cueId: c.id, startX: 0, origStart: c.start, moved: false };
    }
    return { kind: 'scrub' };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!buffer) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const t = timeFromEvent(e);
    const hit = hitTest(t);
    if (hit?.kind === 'move') {
      hit.startX = e.clientX;
      selectCue(hit.cueId);
    }
    if (hit?.kind === 'start' || hit?.kind === 'end') selectCue(hit.cueId);
    dragRef.current = hit;
    if (hit?.kind === 'scrub') {
      audioEngine.seek(show.id, t);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const t = timeFromEvent(e);
    const drag = dragRef.current;
    if (!drag) {
      const hit = hitTest(t);
      setHoverCursor(hit?.kind === 'start' || hit?.kind === 'end' ? 'ew-resize' : hit?.kind === 'move' ? 'grab' : 'text');
      return;
    }
    if (drag.kind === 'start' || drag.kind === 'end') {
      dragBoundary(drag.cueId, drag.kind, t);
    } else if (drag.kind === 'move') {
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 4) drag.moved = true;
      if (drag.moved) {
        const dt = dx / ppsRef.current;
        moveCue(drag.cueId, drag.origStart + dt);
      }
    } else if (drag.kind === 'scrub') {
      audioEngine.seek(show.id, t);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.kind === 'move' && !drag.moved) {
      // 单击 cue：选中并跳转
      const cue = result.cue.find((c) => c.id === drag.cueId);
      if (cue) audioEngine.seek(show.id, cue.start + 0.01);
    }
    if (drag?.kind === 'scrub') {
      // 跳转已在 move/down 处理
    }
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const zoomBy = (delta: number) => setPps((p) => Math.max(24, Math.min(420, p + delta)));

  return (
    <div className="wave-panel">
      <div className="transport">
        <button className="play-btn" onClick={togglePlay} title="播放/暂停（空格）">
          {playing ? '⏸' : '▶'}
        </button>
        <span className="time-readout">
          <span ref={timeRef}>00:00.00</span> <span className="dur">/ {toEditTime(duration)}</span>
        </span>
        <div className="spacer" />
        <div className="zoom-row">
          <button className="btn btn-sm" onClick={() => zoomBy(-24)}>－</button>
          <input type="range" min={24} max={420} step={4} value={pps} onChange={(e) => setPps(parseInt(e.target.value, 10))} />
          <button className="btn btn-sm" onClick={() => zoomBy(24)}>＋</button>
          <button
            className="btn btn-sm"
            onClick={() => {
              const el = scrollRef.current;
              if (el) setPps(Math.max(24, Math.floor((el.clientWidth - 30) / Math.max(1, duration))));
            }}
          >
            适宽
          </button>
        </div>
      </div>

      <div className="wave-scroll" ref={scrollRef}>
        <div style={{ width: widthPx, position: 'relative' }}>
          <canvas ref={rulerCanvasRef} className="ruler-canvas" style={{ display: 'block' }} />
          <div className="wave-inner" style={{ height: WAVE_H, width: widthPx }}>
            <canvas
              ref={waveCanvasRef}
              className="wave-canvas"
              style={{ cursor: hoverCursor, touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            <div
              ref={headRef}
              style={{
                position: 'absolute',
                top: -RULER_H,
                left: 0,
                width: 2,
                height: WAVE_H + RULER_H,
                background: '#fff3d0',
                boxShadow: '0 0 8px rgba(255,220,140,0.9)',
                pointerEvents: 'none',
                zIndex: 6,
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: -5, width: 12, height: 12, borderRadius: 2, background: '#fff3d0' }} />
            </div>
          </div>
        </div>
      </div>
      <div className="hint" style={{ color: '#b79f72', marginTop: 8 }}>
        拖动字幕块两端的 <b style={{ color: '#ffd98a' }}>竖柄</b> 微调出入点；拖动块体可整体移动；点击空白处定位试听。超过 3 秒的拖腔会锁定尾点下限，锣鼓/器乐段以底色标出且不出字幕。
      </div>
    </div>
  );
}
