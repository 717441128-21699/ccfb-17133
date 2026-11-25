// Web Audio API 播放/试听引擎：AudioBuffer 波形数据、区间试听、rAF 时间订阅。
// 高频播放时间不进全局 store，由波形组件自行 rAF 订阅，避免整页重绘。

type TickCallback = (time: number) => void;
type StateCallback = (playing: boolean) => void;

class AudioPlayer {
  ctx: AudioContext | null = null;
  buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  playing = false;
  private startedAtCtx = 0;
  private offset = 0;
  private rangeEnd: number | null = null;
  private tickCbs = new Set<TickCallback>();
  private stateCbs = new Set<StateCallback>();
  private raf = 0;

  ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 1;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setBuffer(buffer: AudioBuffer) {
    this.pause();
    this.buffer = buffer;
    this.offset = 0;
  }

  /** 用合成 PCM 建缓冲 */
  setFromPcm(pcm: Float32Array, sampleRate: number): AudioBuffer {
    const ctx = this.ensureContext();
    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    buf.getChannelData(0).set(pcm);
    this.setBuffer(buf);
    return buf;
  }

  duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** 混合为单声道 PCM（返回独立副本，可 transfer 给 Worker） */
  getMonoPcm(): { pcm: Float32Array; sampleRate: number; duration: number } | null {
    const buf = this.buffer;
    if (!buf) return null;
    const n = buf.length;
    const out = new Float32Array(n);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] += data[i] / buf.numberOfChannels;
    }
    return { pcm: out, sampleRate: buf.sampleRate, duration: buf.duration };
  }

  getTime(): number {
    if (!this.ctx) return this.offset;
    if (this.playing) {
      const t = this.offset + (this.ctx.currentTime - this.startedAtCtx);
      return Math.min(t, this.duration());
    }
    return this.offset;
  }

  seek(t: number) {
    const was = this.playing;
    if (was) this.stopSource();
    this.offset = Math.max(0, Math.min(t, this.duration()));
    if (was) this.startSource(this.offset);
    this.emitTick();
  }

  play(range?: [number, number]) {
    if (!this.buffer) return;
    this.ensureContext();
    if (this.playing) this.stopSource();
    if (range) {
      this.offset = Math.max(0, range[0]);
      this.rangeEnd = range[1];
    } else {
      this.rangeEnd = null;
      if (this.offset >= this.duration() - 0.05) this.offset = 0;
    }
    this.startSource(this.offset);
  }

  pause() {
    this.offset = this.getTime();
    this.stopSource();
    this.playing = false;
    this.rangeEnd = null;
    this.stateCbs.forEach((cb) => cb(false));
    this.stopRaf();
  }

  private startSource(at: number) {
    if (!this.ctx || !this.buffer || !this.gain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.onended = () => {
      // 自然播完（非手动 stop）
      if (this.source === src && this.playing) {
        this.offset = 0;
        this.playing = false;
        this.rangeEnd = null;
        this.stateCbs.forEach((cb) => cb(false));
        this.stopRaf();
      }
    };
    src.start(0, at);
    this.source = src;
    this.startedAtCtx = this.ctx.currentTime;
    this.offset = at;
    this.playing = true;
    this.stateCbs.forEach((cb) => cb(true));
    this.startRaf();
  }

  private stopSource() {
    if (this.source) {
      const s = this.source;
      this.source = null;
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
  }

  onTick(cb: TickCallback): () => void {
    this.tickCbs.add(cb);
    return () => this.tickCbs.delete(cb);
  }
  onStateChange(cb: StateCallback): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  private startRaf() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      const t = this.getTime();
      if (this.rangeEnd != null && t >= this.rangeEnd) {
        this.pause();
        this.seek(this.rangeEnd);
        return;
      }
      this.tickCbs.forEach((cb) => cb(t));
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private stopRaf() {
    cancelAnimationFrame(this.raf);
  }

  private emitTick() {
    this.tickCbs.forEach((cb) => cb(this.getTime()));
  }
}

export const player = new AudioPlayer();
