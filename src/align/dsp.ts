// 纯 PCM 音频分析：能量 VAD、能量凹陷细分音节、YIN 基频、FFT 频谱特征、
// 锣鼓/唱腔/道白粗分类。帧级处理为 O(N)，基频每段常数次，适合 Web Worker。

import type { AudioSegment, SegmentKind } from '../types';
import { freqToPitchCode } from '../audio/pitchcode';
import { spectralFeatures } from './fft';

const HOP = 256;
const FFT_N = 512;

export interface DspOptions {
  vadSensitivity?: number;
  onProgress?: (pct: number, msg: string) => void;
}

interface FrameInfo {
  rms: number;
  zcr: number;
  centroid: number;
  flatness: number;
  highRatio: number;
}

export function analyzePcm(pcm: Float32Array, sampleRate: number, opts: DspOptions = {}): AudioSegment[] {
  const report = opts.onProgress ?? (() => {});
  const sens = opts.vadSensitivity ?? 3.6;
  const nFrames = Math.max(0, Math.floor((pcm.length - FFT_N) / HOP) + 1);
  if (nFrames <= 2) return [];

  const frames: FrameInfo[] = new Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    const start = f * HOP;
    let sum = 0;
    let zero = 0;
    let prev = pcm[start] ?? 0;
    for (let i = 0; i < FFT_N; i++) {
      const v = pcm[start + i] ?? 0;
      sum += v * v;
      if ((prev >= 0 && v < 0) || (prev < 0 && v >= 0)) zero++;
      prev = v;
    }
    const slice = pcm.subarray(start, start + FFT_N);
    const sp = spectralFeatures(slice, sampleRate);
    frames[f] = {
      rms: Math.sqrt(sum / FFT_N),
      zcr: zero / FFT_N,
      centroid: sp.centroid,
      flatness: sp.flatness,
      highRatio: sp.highRatio,
    };
  }
  report(0.4, '频谱与能量分析完成');

  const rmsAll = frames.map((f) => f.rms);
  const sorted = [...rmsAll].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.18)] ?? 0;
  const threshold = Math.max(noise * sens, 0.016);

  const active = new Uint8Array(nFrames);
  for (let f = 0; f < nFrames; f++) active[f] = rmsAll[f] > threshold ? 1 : 0;
  // 仅填补单帧凹陷
  for (let f = 1; f < nFrames - 1; f++) {
    if (!active[f] && active[f - 1] && active[f + 1] && rmsAll[f] > threshold * 0.55) active[f] = 1;
  }

  interface Run {
    f0: number;
    f1: number;
  }
  const runs: Run[] = [];
  let s = -1;
  for (let f = 0; f < nFrames; f++) {
    if (active[f] && s < 0) s = f;
    if ((!active[f] || f === nFrames - 1) && s >= 0) {
      runs.push({ f0: s, f1: active[f] ? f : f - 1 });
      s = -1;
    }
  }

  // 合并间隔 <=1 帧的段
  const mergedRuns: Run[] = [];
  for (const r of runs) {
    const last = mergedRuns[mergedRuns.length - 1];
    if (last && r.f0 - last.f1 <= 2) last.f1 = r.f1;
    else mergedRuns.push({ ...r });
  }

  // 能量凹陷细分（处理道白/连唱中被 VAD 合并的音节；长音无凹陷不会被切）
  const pieces: Run[] = [];
  const minFrames = Math.round(0.09 * sampleRate / HOP);
  for (const run of mergedRuns) {
    const len = run.f1 - run.f0 + 1;
    if (len <= minFrames + 2) {
      pieces.push(run);
      continue;
    }
    const rs = rmsAll.slice(run.f0, run.f1 + 1).sort((a, b) => a - b);
    const median = rs[Math.floor(rs.length * 0.5)];
    const splitAt: number[] = [];
    let lastSplit = run.f0 - 10;
    for (let f = run.f0 + 2; f < run.f1 - 1; f++) {
      if (
        f - lastSplit >= 5 &&
        rmsAll[f] < median * 0.45 &&
        rmsAll[f] <= rmsAll[f - 1] &&
        rmsAll[f] <= rmsAll[f + 1]
      ) {
        splitAt.push(f);
        lastSplit = f;
      }
    }
    let a = run.f0;
    for (const sp of splitAt) {
      pieces.push({ f0: a, f1: sp - 1 });
      a = sp;
    }
    pieces.push({ f0: a, f1: run.f1 });
  }

  report(0.62, `切出 ${pieces.length} 个声音段，提取基频`);

  const segments: AudioSegment[] = [];
  pieces.forEach((run, index) => {
    const startSample = run.f0 * HOP;
    const endSample = Math.min(pcm.length, run.f1 * HOP + FFT_N);
    const start = startSample / sampleRate;
    const end = endSample / sampleRate;
    const dur = end - start;
    if (dur < 0.075) return;

    let e = 0;
    let z = 0;
    let cent = 0;
    let flat = 0;
    let high = 0;
    let brightN = 0;
    let n = 0;
    for (let f = run.f0; f <= run.f1; f++) {
      const fr = frames[f];
      e += fr.rms;
      z += fr.zcr;
      cent += fr.centroid;
      flat += fr.flatness;
      high += fr.highRatio;
      if (fr.centroid > 2300 || fr.flatness > 0.16) brightN++;
      n++;
    }
    const energy = e / n;
    const zcrMean = z / n;
    const centroid = cent / n;
    const flatness = flat / n;
    const highRatio = high / n;
    const brightRatio = brightN / n;

    const yin = yinF0(pcm, startSample, endSample, sampleRate, 0.5);
    const earlyRaw = yinF0(pcm, startSample, endSample, sampleRate, 0.25);
    const lateRaw = yinF0(pcm, startSample, endSample, sampleRate, 0.78);
    const ref = yin.f0 || earlyRaw.f0 || lateRaw.f0;
    const foldOctave = (f: number): number => {
      if (!f || !ref) return f;
      let x = f;
      while (x > ref * 1.7) x /= 2;
      while (x < ref * 0.58) x *= 2;
      return x;
    };
    const early = { f0: foldOctave(earlyRaw.f0), clarity: earlyRaw.clarity };
    const late = { f0: foldOctave(lateRaw.f0), clarity: lateRaw.clarity };
    const f0 = ref;
    const clarity = Math.max(yin.clarity, early.clarity, late.clarity);
    const glide = early.f0 > 0 && late.f0 > 0 ? late.f0 / early.f0 : 1;

    const kind = classify({
      dur,
      zcr: zcrMean,
      clarity,
      glide,
      f0,
      energy,
      centroid,
      flatness,
      highRatio,
      brightRatio,
    });
    let pitchCode = -1;
    if ((kind === 'sing' || kind === 'speak') && clarity >= 0.28) {
      // 用早/中/晚三处平均 MIDI 估音级，削弱滑音与颤音造成的半音抖动
      const fs = [yin.f0, early.f0, late.f0].filter((x) => x > 0);
      if (fs.length) {
        const midiAvg =
          fs.reduce((a, x) => a + 69 + 12 * Math.log2(x / 440), 0) / fs.length;
        const mr = Math.round(midiAvg);
        if (mr >= 43 && mr <= 84) pitchCode = ((mr % 12) + 12) % 12;
      }
    }
    // 衬字：短 + 高腔滑音（合成衬字带 1.16→0.84 的下滑甩腔）
    const ornament =
      (kind === 'sing' || kind === 'speak') &&
      dur < 0.42 &&
      clarity > 0.5 &&
      (glide < 0.9 || (f0 > 255 && dur < 0.34));

    segments.push({
      index: segments.length,
      start,
      end,
      kind,
      f0,
      clarity,
      zcr: zcrMean,
      energy,
      pitchCode,
      ornament,
    });
    void index;
  });

  const consolidated = consolidateFragments(segments);
  report(1, '音频分析完成');
  return consolidated;
}

/**
 * 合并/吸收辅音噪声头、锣鼓尾音等「无音高短碎片」，
 * 避免它们在序列对齐中被误判成临场衬字。按连续碎片块整体折叠。
 */
function consolidateFragments(input: AudioSegment[]): AudioSegment[] {
  const segs = input.map((s) => ({ ...s }));
  const out: AudioSegment[] = [];
  let blockStart: number | null = null;
  let blockEnd = 0;

  const flushBlockInto = (next: AudioSegment | null) => {
    if (blockStart == null) return;
    const prev = out[out.length - 1];
    if (next && next.start - blockEnd < 0.22) {
      next.start = Math.min(next.start, blockStart); // 辅音块并入后字
    } else if (prev && blockStart - prev.end < 0.12 && (prev.kind === 'speak' || prev.kind === 'sing')) {
      prev.end = Math.max(prev.end, blockEnd); // 字尾噪声
    } else if (prev && prev.kind === 'percussion' && blockStart - prev.end < 0.5) {
      prev.end = Math.max(prev.end, blockEnd); // 锣鼓余响
    }
    // 其余孤立噪声块丢弃
    blockStart = null;
  };

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const dur = s.end - s.start;
    const isFrag = dur < 0.24 && s.pitchCode === -1;
    if (isFrag) {
      if (blockStart == null) blockStart = s.start;
      blockEnd = s.end;
      continue;
    }
    flushBlockInto(s);
    out.push(s);
  }
  flushBlockInto(null);
  out.forEach((s, i) => (s.index = i));
  return out;
}

interface ClassifyInput {
  dur: number;
  zcr: number;
  clarity: number;
  glide: number;
  f0: number;
  energy: number;
  centroid: number;
  flatness: number;
  highRatio: number;
  brightRatio: number;
}

function classify(x: ClassifyInput): SegmentKind {
  // 钹 / 高频噪声型锣鼓
  if (x.brightRatio > 0.4 || (x.centroid > 2600 && x.flatness > 0.12)) return 'percussion';
  if (x.zcr > 0.16 && x.flatness > 0.1) return 'percussion';
  // 锣：非谐和 -> YIN 清晰度低，且频谱平坦度偏高
  if (x.clarity < 0.5 && x.flatness > 0.08 && x.energy > 0.05) return 'percussion';
  // 鼓：短促 + 快速下滑
  if (x.dur < 0.55 && x.glide < 0.7 && x.energy > 0.08) return 'percussion';
  if (x.clarity < 0.2) return 'unknown';
  // 道白音节短促（~0.1-0.3s），唱腔正字多在 0.4s 以上，拖腔更长；
  // 时长是比绝对音高（YIN 可能低八度）更稳的分界。
  if (x.dur < 0.34) return 'speak';
  if (x.f0 > 0 && x.f0 < 180 && x.dur < 0.52) return 'speak';
  return 'sing';
}

/* ---------------- YIN 基频 ---------------- */

function yinF0(
  pcm: Float32Array,
  segStart: number,
  segEnd: number,
  sr: number,
  pos: number,
): { f0: number; clarity: number } {
  const W = 1024;
  const segLen = segEnd - segStart;
  const win = Math.min(W, Math.floor(segLen / 2) * 2);
  if (win < 320) return { f0: 0, clarity: 0 };
  const center = segStart + segLen * pos;
  let a = Math.floor(center - win / 2);
  if (a < segStart) a = segStart;
  if (a + win > segEnd) a = segEnd - win;
  if (a < 0 || a + win > pcm.length) return { f0: 0, clarity: 0 };

  const minLag = Math.floor(sr / 420);
  const maxLag = Math.min(Math.floor(sr / 62), Math.floor(win / 2));
  if (maxLag <= minLag + 2) return { f0: 0, clarity: 0 };

  let mean = 0;
  for (let i = 0; i < win; i++) mean += pcm[a + i];
  mean /= win;
  const buf = new Float32Array(win);
  for (let i = 0; i < win; i++) buf[i] = pcm[a + i] - mean;

  const diff = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    const n = win - tau;
    for (let j = 0; j < n; j++) {
      const d = buf[j] - buf[j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  // 累积均值归一化
  const cmnd = new Float32Array(maxLag + 1);
  let run = 0;
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += diff[tau];
    cmnd[tau] = diff[tau] * tau / Math.max(run, 1e-12);
  }
  const threshold = 0.16;
  let tauHat = -1;
  for (let tau = minLag; tau < maxLag; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauHat = tau;
      break;
    }
  }
  if (tauHat < 0) {
    // 退回全局最小
    let best = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (cmnd[tau] < best) {
        best = cmnd[tau];
        tauHat = tau;
      }
    }
    if (best > 0.55) return { f0: 0, clarity: 1 - Math.min(1, best) };
  }
  // 抛物线插值
  let period = tauHat;
  if (tauHat > minLag && tauHat < maxLag) {
    const y1 = cmnd[tauHat - 1];
    const y2 = cmnd[tauHat];
    const y3 = cmnd[tauHat + 1];
    const denom = y1 - 2 * y2 + y3;
    if (denom !== 0) period = tauHat + 0.5 * (y1 - y3) / denom;
  }
  return { f0: sr / period, clarity: Math.max(0, Math.min(1, 1 - cmnd[tauHat])) };
}
