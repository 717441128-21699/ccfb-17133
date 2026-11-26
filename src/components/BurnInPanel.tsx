import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { audioEngine } from '../audio/AudioEngine';
import { wrapLine } from '../utils/text';
import { cueDialectText } from '../utils/subtitles';
import { toast } from '../toast';
import type { AlignmentResult, Show } from '../types/domain';

const W = 1280;
const H = 720;

export function BurnInPanel({ show, result }: { show: Show; result: AlignmentResult }) {
  const maxChars = useStore((s) => s.maxChars);
  const bilingual = useStore((s) => s.bilingual);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const mediaDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const elSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef(0);
  const clockRef = useRef({ offset: 0, startCtx: 0, mode: 'buffer' as 'buffer' | 'video' });
  const recStartRef = useRef(0);
  const chunksRef = useRef<BlobPart[]>([]);

  const lineById = useMemo(() => new Map(show.script.map((l) => [l.id, l])), [show.script]);
  const duration = result.duration;

  /* 取当前应显示的字幕 */
  const subtitleAt = (t: number) => {
    const cue = result.cue.find((c) => t >= c.start && t <= c.end);
    const gap = result.gaps.find((g) => t >= g.start && t <= g.end);
    if (!cue || gap) return { lines: [] as string[], man: [] as string[], gap: gap?.label };
    const line = cue.lineId ? lineById.get(cue.lineId) : undefined;
    return {
      lines: wrapLine(cueDialectText(cue, line), maxChars),
      man: bilingual && cue.mandarin ? wrapLine(cue.mandarin, maxChars + 6) : [],
      gap: undefined as string | undefined,
    };
  };

  /* 绘制一帧 */
  const drawFrame = (t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const video = videoRef.current;
    if (video && videoUrl && video.readyState >= 2) {
      // contain 绘制
      const vr = video.videoWidth / video.videoHeight;
      const cr = W / H;
      let dw = W;
      let dh = H;
      if (vr > cr) dh = W / vr;
      else dw = H * vr;
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    } else {
      drawShadowBackground(ctx, t);
    }

    const { lines, man, gap } = subtitleAt(t);
    ctx.textAlign = 'center';
    if (gap) {
      ctx.font = '700 34px "Microsoft YaHei"';
      const text = `♪ ${gap} ♪`;
      const tw = ctx.measureText(text).width + 60;
      ctx.fillStyle = 'rgba(20,12,4,0.72)';
      roundRect(ctx, W / 2 - tw / 2, 46, tw, 58, 29);
      ctx.fill();
      ctx.strokeStyle = '#c79a3f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#e9c877';
      ctx.fillText(text, W / 2, 86);
    }

    const fontSize = 52;
    ctx.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(20,12,4,0.95)';
    ctx.fillStyle = '#fff6e2';
    const lineH = fontSize * 1.34;
    const manSize = 32;
    const manH = manSize * 1.35;
    const totalH = lines.length * lineH + (man.length ? man.length * manH + 14 : 0);
    let y = H - 70 - totalH + fontSize;
    for (const l of lines) {
      ctx.strokeText(l, W / 2, y);
      ctx.fillText(l, W / 2, y);
      y += lineH;
    }
    if (man.length) {
      y += 6;
      ctx.font = `italic 600 ${manSize}px "Microsoft YaHei"`;
      ctx.lineWidth = 6;
      ctx.fillStyle = '#ffd98a';
      for (const m of man) {
        ctx.strokeText(m, W / 2, y);
        ctx.fillText(m, W / 2, y);
        y += manH;
      }
    }
  };

  /* 预览/录制 rAF 循环 */
  useEffect(() => {
    const loop = () => {
      let t: number;
      if (clockRef.current.mode === 'video' && videoRef.current) {
        t = videoRef.current.currentTime;
      } else if (playing && ctxRef.current && srcNodeRef.current) {
        t = clockRef.current.offset + (ctxRef.current.currentTime - clockRef.current.startCtx);
      } else {
        t = clockRef.current.offset;
      }
      drawFrame(Math.min(Math.max(0, t), duration));
      if (recording) setRecSec(Math.floor((performance.now() - recStartRef.current) / 1000));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, recording, duration, maxChars, bilingual, videoUrl]);

  const ensureGraph = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
      mediaDestRef.current = ctxRef.current.createMediaStreamDestination();
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  };

  const stopBufferSource = () => {
    if (srcNodeRef.current) {
      try {
        srcNodeRef.current.onended = null;
        srcNodeRef.current.stop();
      } catch {
        /* noop */
      }
      srcNodeRef.current.disconnect();
      srcNodeRef.current = null;
    }
  };

  const getTime = () => {
    if (clockRef.current.mode === 'video' && videoRef.current) return videoRef.current.currentTime;
    const ctx = ctxRef.current;
    if (ctx && srcNodeRef.current)
      return clockRef.current.offset + (ctx.currentTime - clockRef.current.startCtx);
    return clockRef.current.offset;
  };

  const togglePreview = async () => {
    const ctx = ensureGraph();
    if (playing) {
      clockRef.current.offset = getTime();
      stopBufferSource();
      videoRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (videoUrl && videoRef.current) {
      clockRef.current.mode = 'video';
      const v = videoRef.current;
      if (!elSrcRef.current) {
        try {
          elSrcRef.current = ctx.createMediaElementSource(v);
          elSrcRef.current.connect(ctx.destination);
          if (mediaDestRef.current) elSrcRef.current.connect(mediaDestRef.current);
        } catch {
          /* element already connected */
        }
      }
      await v.play();
    } else {
      clockRef.current.mode = 'buffer';
      const buf = audioEngine.getBuffer(show.id);
      if (!buf) {
        toast('音频未就绪');
        return;
      }
      if (clockRef.current.offset >= duration - 0.1) clockRef.current.offset = 0;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      if (mediaDestRef.current) src.connect(mediaDestRef.current);
      src.onended = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') stopRecording();
        setPlaying(false);
      };
      src.start(0, clockRef.current.offset);
      srcNodeRef.current = src;
      clockRef.current.startCtx = ctx.currentTime;
    }
    setPlaying(true);
  };

  const onVideoFile = (f: File | undefined | null) => {
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
    clockRef.current.offset = 0;
    toast('视频已载入，将以其画面为底并烧录字幕');
  };

  const pickMime = (): { mime: string; ext: string } => {
    const candidates = [
      { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' },
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) return c;
    }
    return { mime: '', ext: 'webm' };
  };

  const startRecording = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ensureGraph(); // 先建立 AudioContext 与 MediaStreamDestination
    const { mime, ext } = pickMime();
    const vStream = canvas.captureStream(30);
    // 音频统一走 WebAudio 图 -> mediaDest（buffer 或 MediaElementSource 都会接入）
    mediaDestRef.current?.stream.getAudioTracks().forEach((tr: MediaStreamTrack) => vStream.addTrack(tr));
    void ctx;

    const rec = new MediaRecorder(vStream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${show.title}-硬字幕版.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      toast('烧录视频已导出');
    };
    recorderRef.current = rec;
    rec.start(200);
    recStartRef.current = performance.now();
    setRecSec(0);
    setRecording(true);
    // 从头播放
    clockRef.current.offset = 0;
    if (videoRef.current) videoRef.current.currentTime = 0;
    if (!playing) await togglePreview();
    toast('开始实时录制，可随时点“停止并下载”');
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (playing) togglePreview();
  };

  useEffect(
    () => () => {
      stopBufferSource();
      audioEngine.pause(false);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="card">
      <h2>🔥 直接烧进视频（浏览器本地录制）</h2>
      <div className="callout info">
        <span className="ico">🎬</span>
        <div>
          以 1280×720 实时渲染“画面 + 方言大字 + 普通话行”，通过 Canvas + MediaRecorder 录成带硬字幕的视频。
          可上传自己的视频作底；不上传则使用皮影幕布模板 + 该出录音。录制时长等于播放进度，可录一段后随时停止下载。
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} width={W} height={H} className="burn-canvas" />
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            playsInline
            style={{ display: 'none' }}
          />
        )}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={togglePreview}>
          {playing ? '⏸ 暂停预览' : '▶ 预览烧录效果'}
        </button>
        {!recording ? (
          <button className="btn btn-primary" onClick={startRecording}>
            ⏺ 开始录制并烧录
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stopRecording}>
            ⏹ 停止并下载（{recSec}s）
          </button>
        )}
        <label className="btn btn-ghost">
          🎞 选择底版视频
          <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => onVideoFile(e.target.files?.[0])} />
        </label>
        {videoUrl && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setVideoUrl(null); if (videoRef.current) videoRef.current.pause(); }}>
            移除视频，用皮影模板
          </button>
        )}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        优先导出 MP4（若浏览器支持），否则导出通用 WebM；字幕已直接写入画面，任何播放器都能显示。需要在专业软件里压制成 MP4/H.264 时，建议同时下载 SRT/ASS 外挂字幕。
      </div>
    </div>
  );
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

function drawShadowBackground(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.45, 760);
  g.addColorStop(0, '#6b4a26');
  g.addColorStop(0.5, '#3a2814');
  g.addColorStop(1, '#1c1207');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 幕布亮窗
  const sg = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, 420);
  sg.addColorStop(0, 'rgba(255,214,150,0.95)');
  sg.addColorStop(0.6, 'rgba(214,150,74,0.5)');
  sg.addColorStop(1, 'rgba(120,70,26,0)');
  ctx.fillStyle = sg;
  roundRect(ctx, W * 0.16, H * 0.08, W * 0.68, H * 0.72, 18);
  ctx.fill();

  // 皮影人剪影（随时间轻摆）
  ctx.save();
  ctx.translate(W / 2, H * 0.82);
  const sway = Math.sin(t * 1.1) * 0.03;
  ctx.rotate(sway);
  ctx.fillStyle = 'rgba(42,11,8,0.92)';
  // 头
  ctx.beginPath();
  ctx.arc(0, -300, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -352);
  ctx.lineTo(26, -306);
  ctx.lineTo(-26, -306);
  ctx.closePath();
  ctx.fill();
  // 身
  ctx.beginPath();
  ctx.moveTo(-58, -250);
  ctx.quadraticCurveTo(0, -272, 58, -250);
  ctx.lineTo(74, -90);
  ctx.quadraticCurveTo(0, -66, -74, -90);
  ctx.closePath();
  ctx.fill();
  // 臂
  const arm = Math.sin(t * 1.7) * 0.12;
  ctx.save();
  ctx.translate(-52, -240);
  ctx.rotate(-arm);
  ctx.fillRect(-14, 0, 26, 150);
  ctx.restore();
  ctx.save();
  ctx.translate(52, -240);
  ctx.rotate(arm);
  ctx.fillRect(-12, 0, 26, 140);
  ctx.restore();
  // 腿
  ctx.fillRect(-40, -92, 30, 150);
  ctx.fillRect(12, -92, 30, 150);
  ctx.restore();
}
