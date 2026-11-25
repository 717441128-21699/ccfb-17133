// 程序化合成「演出录音」：
// 唱腔 = 带音高锚点 + 揉弦的谐波长音；道白 = 短促富谐波 + 辅音噪声；
// 锣鼓 = 噪声/非谐和分音；器乐过门 = 拨弦五声音阶。
// 输出单声道 Float32 PCM，既可编码 WAV 试听，也直接送进对齐 Worker。

import type { Play, PercussionSpec } from '../types';
import { alignTokens } from '../lib/text';
import { codeToFreq, pitchCodeOf, PARTICLE_CODES } from './pitchcode';

export const SAMPLE_RATE = 22050;

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** -1..1 确定性白噪声 */
  noise(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}

interface SylItem {
  type: 'syl';
  start: number;
  dur: number;
  freq: number;
  voice: 'sing' | 'speak';
  ornament: boolean;
  amplitude: number;
}
interface PercItem {
  type: 'drum' | 'gong' | 'cymbal';
  start: number;
  amp?: number;
}
interface PluckItem {
  type: 'pluck';
  start: number;
  dur: number;
  freq: number;
}
type Item = SylItem | PercItem | PluckItem;

export interface SynthResult {
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
}

export function synthesizePlay(play: Play): SynthResult {
  const rng = new Rng(hashSeed(play.id));
  const items: Item[] = [];

  const skip = new Set(play.perf.skipLines ?? []);
  const adlibByLine = new Map<string, { after: number; text: string }[]>();
  for (const a of play.perf.adLibs ?? []) {
    if (!adlibByLine.has(a.lineId)) adlibByLine.set(a.lineId, []);
    adlibByLine.get(a.lineId)!.push({ after: a.after, text: a.text });
  }
  for (const list of adlibByLine.values()) list.sort((x, y) => x.after - y.after);
  const longToneMap = new Map<string, Map<number, number>>();
  for (const lt of play.perf.longTones ?? []) {
    if (!longToneMap.has(lt.lineId)) longToneMap.set(lt.lineId, new Map());
    longToneMap.get(lt.lineId)!.set(lt.charIndex, lt.seconds);
  }
  const percAfterLine = new Map<string, PercussionSpec>();
  let prelude: PercussionSpec | undefined;
  let postlude: PercussionSpec | undefined;
  for (const p of play.perf.percussions ?? []) {
    if (p.anchor === 'start') prelude = p;
    else if (p.anchor === 'end') postlude = p;
    else percAfterLine.set(p.anchor, p);
  }

  let cursor = 0.35;

  const schedulePercussion = (spec: { seconds: number; kind: 'luogu' | 'instrumental' }, at: number) => {
    if (spec.kind === 'luogu') {
      let t = 0.05;
      let beat = 0;
      while (t < spec.seconds - 0.25) {
        items.push({ type: 'drum', start: at + t });
        if (beat % 2 === 0) {
          items.push({ type: 'gong', start: at + t + 0.01 });
          items.push({ type: 'cymbal', start: at + t, amp: 0.5 });
        } else {
          items.push({ type: 'cymbal', start: at + t + 0.05, amp: 0.3 });
        }
        // 加花
        if (beat % 4 === 3) items.push({ type: 'drum', start: at + t + 0.13, amp: 0.7 });
        t += rng.range(0.26, 0.34);
        beat++;
      }
    } else {
      // 丝弦/唢呐风格的五声拨弦旋律
      const penta = [293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
      let t = 0.05;
      while (t < spec.seconds - 0.3) {
        const f = penta[Math.floor(rng.next() * penta.length)];
        const d = rng.range(0.22, 0.5);
        items.push({ type: 'pluck', start: at + t, dur: d, freq: f });
        t += d * rng.range(0.8, 1.25);
      }
    }
  };

  if (prelude) {
    schedulePercussion(prelude, cursor);
    cursor += prelude.seconds + 0.55;
  }

  for (const line of play.lines) {
    if (skip.has(line.id)) {
      // 漏唱整句：艺人直接跳过，只留一个自然的短句空隙
      cursor += rng.range(0.7, 1.0);
      continue;
    }
    const tokens = alignTokens(line.dialect);
    const lineAdlibs = adlibByLine.get(line.id) ?? [];
    const ltMap = longToneMap.get(line.id);
    let emitted = 0;
    const emitAdlibs = () => {
      while (lineAdlibs.length && lineAdlibs[0].after === emitted) {
        const a = lineAdlibs.shift()!;
        const code = PARTICLE_CODES[a.text] ?? pitchCodeOf(a.text);
        const dur = rng.range(0.24, 0.36);
        items.push({
          type: 'syl',
          start: cursor,
          dur,
          freq: codeToFreq(code),
          voice: 'sing',
          ornament: true,
          amplitude: 0.34,
        });
        cursor += dur + 0.09;
      }
    };
    for (let i = 0; i < tokens.length; i++) {
      emitAdlibs();
      const isSpeak = line.kind === 'speak';
      const longSec = ltMap?.get(i);
      const dur = longSec ?? (isSpeak ? rng.range(0.15, 0.24) : rng.range(0.47, 0.64));
      const code = pitchCodeOf(tokens[i]);
      // 道白降低一个八度左右，与唱腔区分
      const freq = isSpeak ? codeToFreq(code) * 0.5 : codeToFreq(code);
      items.push({
        type: 'syl',
        start: cursor,
        dur,
        freq,
        voice: isSpeak ? 'speak' : 'sing',
        ornament: false,
        amplitude: isSpeak ? 0.42 : 0.3,
      });
      cursor += dur + (isSpeak ? rng.range(0.035, 0.06) : rng.range(0.07, 0.12));
      emitted++;
    }
    // 行末仍可能有 after === tokens.length 的衬字
    emitted = tokens.length;
    emitAdlibs();

    cursor += rng.range(0.55, 1.0);
    const perc = percAfterLine.get(line.id);
    if (perc) {
      schedulePercussion(perc, cursor);
      cursor += perc.seconds + 0.45;
    }
  }

  if (postlude) {
    schedulePercussion(postlude, cursor);
    cursor += postlude.seconds + 0.8;
  }

  const totalSeconds = cursor + 0.5;
  const pcm = new Float32Array(Math.ceil(totalSeconds * SAMPLE_RATE));
  for (const it of items) renderItem(pcm, it, rng);

  // 软限幅 + 峰值归一
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.tanh(pcm[i] * 1.1);
    const a = Math.abs(pcm[i]);
    if (a > peak) peak = a;
  }
  const g = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= g;

  return { pcm, sampleRate: SAMPLE_RATE, duration: pcm.length / SAMPLE_RATE };
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ---------------- 渲染各音色 ---------------- */

function renderItem(out: Float32Array, it: Item, rng: Rng): void {
  const sr = SAMPLE_RATE;
  const i0 = Math.floor(it.start * sr);
  if (it.type === 'syl') renderVoice(out, i0, Math.floor(it.dur * sr), it, rng);
  else if (it.type === 'drum') renderDrum(out, i0, it.amp ?? 1, rng);
  else if (it.type === 'gong') renderGong(out, i0, rng);
  else if (it.type === 'cymbal') renderCymbal(out, i0, it.amp ?? 0.4, rng);
  else if (it.type === 'pluck') renderPluck(out, i0, Math.floor(it.dur * sr), it.freq);
}

function addSample(out: Float32Array, idx: number, v: number): void {
  if (idx >= 0 && idx < out.length) out[idx] += v;
}

function renderVoice(out: Float32Array, i0: number, n: number, it: SylItem, rng: Rng): void {
  const sr = SAMPLE_RATE;
  const isSpeak = it.voice === 'speak';
  const attack = Math.floor((isSpeak ? 0.012 : 0.045) * sr);
  const release = Math.floor(Math.min(isSpeak ? 0.05 : 0.28, n * 0.25) * sr);
  let phase = 0;
  // 辅音噪声
  if (isSpeak) {
    const cn = Math.floor(0.05 * sr);
    for (let i = 0; i < cn && i < n; i++) {
      const env = 1 - i / cn;
      addSample(out, i0 + i, rng.noise() * env * env * 0.18 * it.amplitude);
    }
  }
  const harmonics = isSpeak ? [1, 0.6, 0.42, 0.28, 0.18, 0.1] : [1, 0.42, 0.2, 0.09];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = i / n;
    // 音高走向：唱腔轻微滑入 + 揉弦；衬字高腔甩音；道白近似平直
    let mul = 1;
    if (!isSpeak) {
      if (i < attack * 2) mul *= 0.96 + 0.04 * (i / (attack * 2));
      const vibDepth = it.dur > 2.5 ? 0.018 : 0.01;
      mul *= 1 + vibDepth * Math.sin(2 * Math.PI * 5.6 * t);
      if (it.ornament) mul *= 1.16 - 0.32 * p + 0.05 * Math.sin(2 * Math.PI * 7 * t);
    } else {
      mul *= 1 + 0.02 * Math.sin(2 * Math.PI * 4.5 * t) - 0.05 * p;
    }
    const f = it.freq * mul;
    phase += (2 * Math.PI * f) / sr;
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      v += Math.sin(phase * (h + 1)) * harmonics[h];
    }
    v *= 0.5;
    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > n - release) env = Math.max(0, (n - i) / release);
    addSample(out, i0 + i, v * env * it.amplitude);
  }
}

function renderDrum(out: Float32Array, i0: number, amp: number, rng: Rng): void {
  const sr = SAMPLE_RATE;
  const n = Math.floor(0.3 * sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 150 * Math.exp(-t * 16) + 52;
    phase += (2 * Math.PI * f) / sr;
    const body = Math.sin(phase) * Math.exp(-t * 13);
    const noise = rng.noise() * Math.exp(-t * 34) * 0.5;
    addSample(out, i0 + i, (body + noise) * 0.85 * amp);
  }
}

function renderGong(out: Float32Array, i0: number, rng: Rng): void {
  const sr = SAMPLE_RATE;
  const n = Math.floor(2.2 * sr);
  const base = 168;
  const partials: [number, number, number][] = [
    [1, 0.9, 2.2],
    [1.407, 0.55, 2.8],
    [2.11, 0.42, 3.4],
    [2.74, 0.28, 4.2],
    [3.76, 0.18, 5.0],
  ];
  const phases = partials.map(() => rng.next() * 6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    partials.forEach(([r, g, d], k) => {
      v += Math.sin(2 * Math.PI * base * r * t + phases[k]) * g * Math.exp(-t * d);
    });
    // 敲击噪声头
    v += rng.noise() * Math.exp(-t * 40) * 0.5;
    addSample(out, i0 + i, v * 0.34);
  }
}

function renderCymbal(out: Float32Array, i0: number, amp: number, rng: Rng): void {
  const sr = SAMPLE_RATE;
  const n = Math.floor(0.55 * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 8.5);
    // 用差分白噪声模拟高频金属噪声
    const v = rng.noise() - rng.noise() * 0.6;
    addSample(out, i0 + i, v * env * 0.22 * amp);
  }
}

function renderPluck(out: Float32Array, i0: number, n: number, freq: number): void {
  const sr = SAMPLE_RATE;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * freq) / sr;
    const env = Math.exp(-t * 7.5);
    const v =
      Math.sin(phase) * 0.8 +
      Math.sin(phase * 2) * 0.35 * Math.exp(-t * 12) +
      Math.sin(phase * 3.01) * 0.18 * Math.exp(-t * 16);
    addSample(out, i0 + i, v * env * 0.3);
  }
}

/** 编码 16-bit PCM WAV */
export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
