import type { GapType, PerfExtra, Show } from '../types/domain';
import { spokenChars } from '../utils/text';

export const SAMPLE_RATE = 22050;

export interface TruthChar {
  lineId: string;
  charIndex: number;
  ch: string;
  start: number;
  end: number;
  extra: boolean;
}
export interface TruthLine {
  lineId: string;
  start: number;
  end: number;
  sung: boolean;
}
export interface TruthGap {
  type: GapType;
  start: number;
  end: number;
}
export interface SynthTruth {
  chars: TruthChar[];
  lines: TruthLine[];
  gaps: TruthGap[];
  duration: number;
}

interface ToneEvent {
  kind: 'sing' | 'speak' | 'extra' | 'erhu';
  start: number;
  dur: number;
  freq: number;
  freqTo?: number;
  gain: number;
}
interface PercEvent {
  kind: 'drum' | 'gong' | 'cymbal' | 'block';
  start: number;
  gain: number;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 五声音阶频率（C 宫调），按字选音，保证同字稳定 */
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

function charFreq(ch: string, i: number, rng: () => number): number {
  const code = ch.codePointAt(0) ?? i;
  const idx = (code + i * 3 + Math.floor(rng() * 3)) % PENTA.length;
  return PENTA[idx];
}

/**
 * 根据 Show 及其 perf 计划合成整出戏的单声道 PCM。
 * 纯数学渲染，不依赖 AudioContext，Node 脚本与浏览器均可运行。
 */
export function renderShow(
  show: Show,
  sampleRate = SAMPLE_RATE,
): { samples: Float32Array; sampleRate: number; truth: SynthTruth } {
  const rng = mulberry32(hashSeed(show.id));
  const tones: ToneEvent[] = [];
  const percs: PercEvent[] = [];
  const truthChars: TruthChar[] = [];
  const truthLines: TruthLine[] = [];
  const truthGaps: TruthGap[] = [];

  let t = 0.35;

  const scheduleGap = (sec: number, type: GapType) => {
    if (sec <= 0) return;
    if (type === 'silence') {
      truthGaps.push({ type, start: t, end: t + sec });
      t += sec;
      return;
    }
    // 锣鼓/器乐前后留干净的气口，使自动分块能把过门与唱句分开
    const padIn = 0.42;
    const padOut = 0.58;
    const musicStart = t + padIn;
    truthGaps.push({ type, start: t, end: musicStart + sec + padOut });
    if (type === 'luogu') {
      const beat = 0.27;
      const beats = Math.floor(sec / beat);
      for (let k = 0; k < beats; k++) {
        const bt = musicStart + k * beat;
        percs.push({ kind: 'drum', start: bt, gain: 0.85 });
        percs.push({ kind: 'cymbal', start: bt, gain: k % 2 === 0 ? 0.85 : 0.55 });
        if (k % 8 === 0) percs.push({ kind: 'gong', start: bt, gain: 0.9 });
        if (k % 4 === 2) percs.push({ kind: 'block', start: bt + beat / 2, gain: 0.5 });
      }
    } else if (type === 'instrumental') {
      // 连续弓子音色、滑音相连，几乎没有音头断裂 -> 检测为一个长段
      const notes = Math.max(2, Math.round(sec / 1.15));
      const slot = sec / notes;
      const noteDur = slot + 0.06;
      for (let k = 0; k < notes; k++) {
        const f = PENTA[(k * 2 + 1) % 5];
        tones.push({
          kind: 'erhu',
          start: musicStart + k * slot,
          dur: noteDur,
          freq: f,
          freqTo: PENTA[(k * 2 + 3) % 5],
          gain: 0.32,
        });
      }
    }
    t = musicStart + sec + padOut;
  };

  if (show.perf.intro) scheduleGap(show.perf.intro.sec, show.perf.intro.type);

  for (const line of show.script) {
    const ov = show.perf.lines[line.id];
    const lineStart = t;
    if (ov?.sung === false) {
      truthLines.push({ lineId: line.id, start: t, end: t, sung: false });
      if (ov.gapAfter) scheduleGap(ov.gapAfter.sec, ov.gapAfter.type);
      continue;
    }

    const kind = line.kind;
    const chars = spokenChars(line.dialect);
    const baseDur = ov?.charDur ?? (kind === 'sing' ? 0.4 : 0.17);
    const extrasByPos = new Map<number, PerfExtra[]>();
    for (const e of ov?.extras ?? []) {
      const pos = Math.max(0, Math.min(chars.length, e.after));
      if (!extrasByPos.has(pos)) extrasByPos.set(pos, []);
      extrasByPos.get(pos)!.push(e);
    }

    const pushExtra = (e: PerfExtra) => {
      const dur = e.dur ?? 0.22;
      // 衬字前给一个小顿挫，使其成为可分辨的独立音节（语气衬字常作停顿）
      t += 0.05 + rng() * 0.05;
      truthChars.push({ lineId: line.id, charIndex: -1, ch: e.ch, start: t, end: t + dur, extra: true });
      tones.push({
        kind: 'extra',
        start: t,
        dur,
        freq: kind === 'sing' ? charFreq(e.ch, 0, rng) / 2 : 190 + rng() * 40,
        gain: 0.55,
      });
      t += dur + (kind === 'sing' ? 0.1 + rng() * 0.08 : 0.06 + rng() * 0.05);
    };

    extrasByPos.get(0)?.forEach(pushExtra);

    let spokenIndex = 0;
    for (const ch of line.dialect) {
      if (/[一-鿿㐀-䶿豈-﫿a-zA-Z0-9]/.test(ch)) {
        const i = spokenIndex;
        const drag = ov?.drag?.[i] ?? 0;
        const dur = baseDur * (0.92 + rng() * 0.16) + drag;
        const freq =
          kind === 'sing'
            ? charFreq(ch, i, rng)
            : 150 + ((ch.codePointAt(0) ?? i) % 60) + rng() * 20;
        truthChars.push({ lineId: line.id, charIndex: i, ch, start: t, end: t + dur, extra: false });
        tones.push({
          kind,
          start: t,
          dur,
          freq,
          freqTo: kind === 'speak' ? freq * 0.72 : undefined,
          gain: kind === 'sing' ? 0.62 : 0.7,
        });
        t += dur;
        t += kind === 'sing' ? 0.07 + rng() * 0.08 : 0.05 + rng() * 0.06;
        spokenIndex++;
        // after = 已处理字数：处理完第 i 字后 spokenIndex === i+1
        extrasByPos.get(spokenIndex)?.forEach(pushExtra);
      } else if ('，。！？；、,.!?;'.includes(ch)) {
        // 句读小停顿，明显小于“句间停顿”阈值
        t += kind === 'sing' ? 0.1 + rng() * 0.06 : 0.05 + rng() * 0.05;
      }
    }

    truthLines.push({ lineId: line.id, start: lineStart, end: t, sung: true });
    const gap = ov?.gapAfter ?? { sec: 0.62, type: 'silence' as GapType };
    scheduleGap(gap.sec, gap.type);
  }

  if (show.perf.outro) scheduleGap(show.perf.outro.sec, show.perf.outro.type);
  t += 0.4;

  const total = Math.ceil(t * sampleRate);
  const buf = new Float32Array(total);

  for (const ev of tones) renderTone(buf, sampleRate, ev, rng);
  for (const p of percs) renderPerc(buf, sampleRate, p, rng);

  // 轻微饱和 + 归一化
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] * 1.15);
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  const g = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;

  return {
    samples: buf,
    sampleRate,
    truth: { chars: truthChars, lines: truthLines, gaps: truthGaps, duration: total / sampleRate },
  };
}

function renderTone(buf: Float32Array, sr: number, ev: ToneEvent, rng: () => number): void {
  const s0 = Math.floor(ev.start * sr);
  const n = Math.floor(ev.dur * sr);
  const attack = Math.floor((ev.kind === 'speak' ? 0.012 : 0.035) * sr);
  const release = Math.floor(0.07 * sr);
  let phase = 0;
  const harmonics =
    ev.kind === 'sing'
      ? [1, 0.5, 0.3, 0.16, 0.08]
      : ev.kind === 'erhu'
        ? [1, 0.42, 0.22, 0.1]
        : [1, 0.35, 0.12];

  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const p = i / n;
    let f = ev.freq;
    if (ev.freqTo !== undefined) {
      const glide = ev.kind === 'erhu' ? p * p * (3 - 2 * p) : p;
      f = ev.freq + (ev.freqTo - ev.freq) * glide;
    }
    if (ev.kind === 'sing' && i / sr > 0.18) {
      f *= 1 + 0.012 * Math.sin(2 * Math.PI * 5.6 * (i / sr));
    }
    phase += (2 * Math.PI * f) / sr;

    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      v += harmonics[h] * Math.sin(phase * (h + 1));
    }
    v /= 1.6;

    // 呼吸噪声
    if (ev.kind === 'sing' || ev.kind === 'erhu') {
      v += (rng() * 2 - 1) * 0.012;
    }

    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > n - release) env = Math.max(0, (n - i) / release);
    if (ev.kind === 'speak') env *= 0.9 + 0.1 * Math.exp(-p * 3);
    if (ev.kind === 'erhu') env = Math.min(1, i / attack) * Math.min(1, (n - i) / Math.floor(0.08 * sr));

    // 道白字头的辅音噪声
    let consonant = 0;
    if (ev.kind === 'speak' && i < sr * 0.05) {
      consonant = (rng() * 2 - 1) * Math.pow(1 - i / (sr * 0.05), 2) * 0.25;
    }
    buf[s0 + i] += (v * env + consonant) * ev.gain;
  }
}

function renderPerc(buf: Float32Array, sr: number, ev: PercEvent, rng: () => number): void {
  const s0 = Math.floor(ev.start * sr);
  if (ev.kind === 'drum') {
    const n = Math.floor(0.3 * sr);
    let phase = 0;
    for (let i = 0; i < n && s0 + i < buf.length; i++) {
      const p = i / n;
      const f = 150 * Math.exp(-p * 3.2) + 46;
      phase += (2 * Math.PI * f) / sr;
      const env = Math.exp(-p * 6.5);
      buf[s0 + i] += Math.sin(phase) * env * ev.gain * 0.95;
      if (i < 200) buf[s0 + i] += (rng() * 2 - 1) * (1 - i / 200) * 0.2 * ev.gain;
    }
  } else if (ev.kind === 'gong') {
    const n = Math.floor(1.9 * sr);
    const parts = [1, 1.47, 2.12, 2.9, 4.2];
    const gains = [0.9, 0.5, 0.35, 0.22, 0.12];
    for (let i = 0; i < n && s0 + i < buf.length; i++) {
      const p = i / n;
      const env = Math.exp(-p * 3.4);
      let v = 0;
      for (let h = 0; h < parts.length; h++) {
        v += gains[h] * Math.sin(2 * Math.PI * 196 * parts[h] * (i / sr) + h);
      }
      v += (rng() * 2 - 1) * 0.25 * Math.exp(-p * 9);
      buf[s0 + i] += v * env * ev.gain * 0.5;
    }
  } else if (ev.kind === 'cymbal') {
    const n = Math.floor(0.6 * sr);
    let prev = 0;
    let prev2 = 0;
    for (let i = 0; i < n && s0 + i < buf.length; i++) {
      const p = i / n;
      const white = rng() * 2 - 1;
      // 两级差分，得到更亮的高频碎片
      const hp1 = white - prev;
      const hp2 = hp1 - prev2;
      prev = white * 0.8;
      prev2 = hp1 * 0.6;
      const env = Math.exp(-p * 6.5);
      buf[s0 + i] += hp2 * env * ev.gain * 0.55 + hp1 * env * ev.gain * 0.2;
    }
  } else {
    const n = Math.floor(0.07 * sr);
    for (let i = 0; i < n && s0 + i < buf.length; i++) {
      const env = Math.exp(-(i / n) * 18);
      buf[s0 + i] += Math.sin(2 * Math.PI * 760 * (i / sr)) * env * ev.gain * 0.5;
    }
  }
}
