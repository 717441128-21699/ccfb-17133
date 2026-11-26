/**
 * 全局 Web Audio 播放引擎：缓存各出戏的 AudioBuffer，
 * 负责播放 / 暂停 / 跳转，并以 requestAnimationFrame 上报播放头。
 * 波形显示与试听都走这里。
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAtCtx = 0;
  private offset = 0;
  private playingId: string | null = null;
  private endTimer: number | null = null;
  onStateChange: (() => void) | null = null;

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

  hasBuffer(id: string): boolean {
    return this.buffers.has(id);
  }

  getBuffer(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  setBuffer(id: string, buffer: AudioBuffer): void {
    this.buffers.set(id, buffer);
  }

  async decodeFile(file: Blob): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const ab = await file.arrayBuffer();
    return ctx.decodeAudioData(ab);
  }

  async loadUrl(id: string, url: string): Promise<AudioBuffer> {
    if (this.buffers.has(id)) return this.buffers.get(id)!;
    const ctx = this.ensureContext();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`录音加载失败：${url}`);
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    this.buffers.set(id, buf);
    return buf;
  }

  get currentTime(): number {
    if (!this.ctx || !this.playingId) return this.offset;
    return Math.min(this.offset + (this.ctx.currentTime - this.startedAtCtx), this.duration);
  }

  get duration(): number {
    return this.playingId ? this.buffers.get(this.playingId)?.duration ?? 0 : 0;
  }

  get activeId(): string | null {
    return this.playingId;
  }

  isPlaying(id?: string): boolean {
    return this.playingId !== null && (id === undefined || this.playingId === id);
  }

  private stopSource(): void {
    if (this.endTimer !== null) {
      window.clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  async play(id: string, from?: number, onEnded?: () => void): Promise<void> {
    const buf = this.buffers.get(id);
    if (!buf) throw new Error('录音尚未就绪');
    const ctx = this.ensureContext();
    this.pause(false);
    if (from !== undefined) this.offset = Math.max(0, Math.min(from, buf.duration));
    else if (this.playingId !== id) this.offset = 0;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain ?? ctx.destination);
    this.source = src;
    this.playingId = id;
    this.startedAtCtx = ctx.currentTime;
    src.start(0, this.offset);

    const remaining = (buf.duration - this.offset) * 1000;
    this.endTimer = window.setTimeout(() => {
      this.offset = 0;
      this.playingId = null;
      this.stopSource();
      this.onStateChange?.();
      onEnded?.();
    }, remaining + 60);
    this.onStateChange?.();
  }

  pause(notify = true): void {
    if (this.ctx && this.playingId) {
      this.offset = this.currentTime;
    }
    this.stopSource();
    this.playingId = null;
    if (notify) this.onStateChange?.();
  }

  seek(id: string, time: number): void {
    const wasPlaying = this.isPlaying(id);
    this.offset = Math.max(0, time);
    if (wasPlaying) void this.play(id, this.offset);
    this.onStateChange?.();
  }

  /** 仅移动播放头（未播放时） */
  setPosition(time: number): void {
    this.offset = Math.max(0, time);
    this.onStateChange?.();
  }
}

export const audioEngine = new AudioEngine();
