import {
  LONG_DRAG_SECONDS,
  type AlignOptions,
  type AlignStats,
  type AlignmentResult,
  type AlignedChar,
  type Cue,
  type GapRegion,
  type GapType,
  type ScriptLine,
} from '../types/domain';
import { spokenChars } from '../utils/text';

export const ENGINE_VERSION = 'banded-dtw-1.0';

export const DEFAULT_ALIGN_OPTIONS: AlignOptions = {
  sensitivity: 0.55,
  lineGap: 0.42,
};

interface Frame {
  t: number;
  rms: number;
  zcr: number;
  hf: number;
}
interface Segment {
  start: number;
  end: number;
  dur: number;
  /** 超长持续音（可能是拖腔，也可能是器乐过门） */
  long: boolean;
  /** 平均高频比，用于区分明亮器乐/噪声 */
  hfMean: number;
}
interface Phrase {
  start: number;
  end: number;
  segs: Segment[];
}
interface PercRegion {
  start: number;
  end: number;
}

const now = (): number =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

/* ====================================================================== */
/* 主入口                                                                  */
/* ====================================================================== */

export function alignAudio(
  samples: Float32Array,
  sampleRate: number,
  script: ScriptLine[],
  options: AlignOptions = DEFAULT_ALIGN_OPTIONS,
  onProgress?: (stage: string, pct: number) => void,
): AlignmentResult {
  const t0 = now();
  const progress = (stage: string, pct: number) => onProgress?.(stage, pct);

  progress('分析频谱与能量', 0.08);
  const frames = extractFrames(samples, sampleRate);

  progress('识别锣鼓过门', 0.28);
  const perc = detectPercussion(frames, sampleRate);

  progress('切分唱字音节', 0.45);
  const segs = detectSyllables(frames, perc, options, sampleRate);

  progress('划分唱句呼吸', 0.62);
  const phrases = groupPhrases(segs, options.lineGap);

  progress('动态规整对齐', 0.75);
  const { assignments, orphanPhrases } = alignLinesToPhrases(script, phrases);

  progress('生成字级时间轴', 0.9);
  const { cues, matched, extra, instrumentalSpans } = buildCues(assignments, orphanPhrases);

  progress('整理过门与字幕保持规则', 0.96);
  const duration = samples.length / sampleRate;
  const gaps = buildGaps(cues, perc, frames, duration, instrumentalSpans);
  finalizeWindows(cues, gaps);

  const scriptChars = script.reduce((n, l) => n + spokenChars(l.dialect).length, 0);
  const missingLines = script.filter((l) => !cues.some((c) => c.lineId === l.id)).length;
  const engineMs = now() - t0;

  const stats: AlignStats = {
    scriptLines: script.length,
    sungLines: script.length - missingLines,
    scriptChars,
    detectedSegments: segs.length,
    matchedChars: matched,
    extraChars: extra,
    missingLines,
    gaps: gaps.length,
    durationSec: duration,
    engineMs: Math.round(engineMs),
  };

  progress('完成', 1);
  return { cue: cues, gaps, duration, stats, engine: ENGINE_VERSION, alignedAt: Date.now() };
}

/* ====================================================================== */
/* 帧特征：RMS / 过零率 / 高频能量比                                        */
/* ====================================================================== */

function extractFrames(samples: Float32Array, sr: number): Frame[] {
  // 目标帧长 ≈23ms、帧移 ≈11.6ms，随采样率缩放
  const frameLen = Math.max(128, Math.round(sr * 0.0232));
  const hop = Math.max(64, Math.round(sr * 0.0116));
  const frames: Frame[] = [];
  for (let start = 0; start + frameLen <= samples.length; start += hop) {
    let sumSq = 0;
    let crossings = 0;
    let hfSq = 0;
    let prev = samples[start];
    for (let i = 0; i < frameLen; i++) {
      const x = samples[start + i];
      sumSq += x * x;
      if (i > 0 && (prev >= 0) !== (x >= 0)) crossings++;
      const d = x - prev;
      hfSq += d * d;
      prev = x;
    }
    const rms = Math.sqrt(sumSq / frameLen) + 1e-7;
    const hf = Math.sqrt(hfSq / frameLen);
    frames.push({
      t: (start + frameLen / 2) / sr,
      rms,
      zcr: crossings / frameLen,
      hf: hf / rms,
    });
  }
  return frames;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

/* ====================================================================== */
/* 锣鼓检测：高过零率 + 高高频比的噪声音帧聚成段                             */
/* ====================================================================== */

function detectPercussion(frames: Frame[], sr: number): PercRegion[] {
  if (frames.length < 8) return [];
  const HOP = Math.max(64, Math.round(sr * 0.0116)) / sr;
  // 合成锣鼓的高频比中位数 >1.0，唱腔 <0.2，阈值取中间偏保守
  const bright = frames.map((f) => f.hf > 0.62 || (f.zcr > 0.16 && f.hf > 0.45));

  // 约 0.46s 的居中滑窗
  const W = 20;
  const score = new Array<number>(frames.length).fill(0);
  for (let i = 0; i < frames.length; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(frames.length - 1, i + W);
    let cnt = 0;
    for (let k = a; k <= b; k++) if (bright[k]) cnt++;
    score[i] = cnt / (b - a + 1);
  }
  let percFrame = score.map((s) => s >= 0.32);

  // 取出连续段，再合并间隔 ≤0.42s 的段（鼓点之间的低频空隙）
  const raw: PercRegion[] = [];
  let s = -1;
  for (let k = 0; k < percFrame.length; k++) {
    if (percFrame[k] && s < 0) s = k;
    if ((!percFrame[k] || k === percFrame.length - 1) && s >= 0) {
      const e = percFrame[k] ? k : k - 1;
      raw.push({ start: Math.max(0, frames[s].t - 0.08), end: frames[e].t + HOP * 2 });
      s = -1;
    }
  }
  const merged = mergeRegions(raw, 0.42).filter((r) => r.end - r.start >= 0.9);
  return merged;
}

function mergeRegions(regions: PercRegion[], gap: number): PercRegion[] {
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const out: PercRegion[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start - last.end <= gap) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

function inPerc(t: number, perc: PercRegion[], pad = 0): boolean {
  return perc.some((p) => t >= p.start - pad && t <= p.end + pad);
}

/* ====================================================================== */
/* 音节切分：能量活跃段，填补 ≤1 帧的小断裂                                 */
/* ====================================================================== */

function detectSyllables(frames: Frame[], perc: PercRegion[], options: AlignOptions, sr: number): Segment[] {
  const sortedRms = frames.map((f) => f.rms).sort((a, b) => a - b);
  const floor = quantile(sortedRms, 0.2);
  // sensitivity 越高阈值越低
  const k = 3.4 - options.sensitivity * 1.6; // 0.55 -> 2.52
  const thr = Math.max(0.028, floor * k + 0.012);
  const hopT = Math.max(64, Math.round(sr * 0.0116)) / sr;

  const active = frames.map((f) => {
    if (f.rms <= thr) return false;
    if (inPerc(f.t, perc, 0.05)) return false;
    // 排除锣鼓段之后的低频余响，避免锣尾被当成一个唱字音节
    const gongTail = perc.some((p) => f.t > p.end - 0.02 && f.t <= p.end + 0.45);
    return !gongTail;
  });
  // 填补 1 帧断裂
  for (let i = 1; i < active.length - 1; i++) {
    if (!active[i] && active[i - 1] && active[i + 1]) active[i] = true;
  }

  const segs: Segment[] = [];
  let start = -1;
  for (let i = 0; i < active.length; i++) {
    if (active[i] && start < 0) start = i;
    if ((!active[i] || i === active.length - 1) && start >= 0) {
      const endIdx = active[i] ? i : i - 1;
      const startT = Math.max(0, frames[start].t - 0.018);
      const endT = frames[endIdx].t + hopT * 1.6;
      if (endT - startT >= 0.075) {
        let hfSum = 0;
        for (let k = start; k <= endIdx; k++) hfSum += frames[k].hf;
        const hfMean = hfSum / Math.max(1, endIdx - start + 1);
        segs.push({ start: startT, end: endT, dur: endT - startT, long: endT - startT >= 1.9, hfMean });
      }
      start = -1;
    }
  }
  return segs;
}

function groupPhrases(segs: Segment[], lineGap: number): Phrase[] {
  const phrases: Phrase[] = [];
  let cur: Segment[] = [];
  const flush = () => {
    if (cur.length) {
      phrases.push({ start: cur[0].start, end: cur[cur.length - 1].end, segs: cur });
      cur = [];
    }
  };
  // 仅按句间大停顿分块。拖腔后的句尾衬字与本句间隔很小，自然留在同一块；
  // 器乐/锣鼓过门由合成留白与特征检测隔成独立块。
  for (const s of segs) {
    if (cur.length && s.start - cur[cur.length - 1].end > lineGap) flush();
    cur.push(s);
  }
  flush();
  return phrases;
}

/* ====================================================================== */
/* 句级对齐：唱本行 ↔ 音频“乐句”，允许漏句 / 外加句                         */
/* ====================================================================== */

type LineOp =
  | { op: 'match'; line: ScriptLine; phrase: Phrase }
  | { op: 'skipLine'; line: ScriptLine }
  | { op: 'skipPhrase'; phrase: Phrase };

interface LineAssignment {
  line: ScriptLine;
  phrase: Phrase | null;
}

function lineMatchCost(line: ScriptLine, ph: Phrase): number {
  const n = spokenChars(line.dialect).length;
  const m = ph.segs.length;
  let cost = 1.7 * Math.abs(m - n);
  // 时长弱先验：拖腔会让实际时长偏长，只在偏差很离谱时加权
  const expected = n * (line.kind === 'speak' ? 0.2 : 0.42);
  const r = (ph.end - ph.start) / expected;
  if (r > 0.4 && r < 6) cost += 0.25 * Math.abs(Math.log(r));
  // 纯器乐长段（音节极少但时间很长）重罚匹配
  if (m <= 2 && ph.end - ph.start > 2.5) cost += 4;
  return cost;
}

function alignLinesToPhrases(
  script: ScriptLine[],
  phrases: Phrase[],
): { assignments: LineAssignment[]; orphanPhrases: Phrase[] } {
  const L = script.length;
  const P = phrases.length;
  const MISS_LINE = 3.2;
  const SKIP_PHRASE = 2.6;

  const dp: number[][] = Array.from({ length: L + 1 }, () => new Array<number>(P + 1).fill(Infinity));
  const bt: (LineOp | null)[][] = Array.from({ length: L + 1 }, () => new Array(P + 1).fill(null));
  dp[0][0] = 0;
  for (let i = 1; i <= L; i++) {
    dp[i][0] = dp[i - 1][0] + MISS_LINE;
    bt[i][0] = { op: 'skipLine', line: script[i - 1] };
  }
  for (let j = 1; j <= P; j++) {
    dp[0][j] = dp[0][j - 1] + SKIP_PHRASE;
    bt[0][j] = { op: 'skipPhrase', phrase: phrases[j - 1] };
  }

  for (let i = 1; i <= L; i++) {
    for (let j = 1; j <= P; j++) {
      const match = dp[i - 1][j - 1] + lineMatchCost(script[i - 1], phrases[j - 1]);
      const miss = dp[i - 1][j] + MISS_LINE;
      const extra = dp[i][j - 1] + SKIP_PHRASE;
      const best = Math.min(match, miss, extra);
      dp[i][j] = best;
      if (best === match) bt[i][j] = { op: 'match', line: script[i - 1], phrase: phrases[j - 1] };
      else if (best === miss) bt[i][j] = { op: 'skipLine', line: script[i - 1] };
      else bt[i][j] = { op: 'skipPhrase', phrase: phrases[j - 1] };
    }
  }

  const assignments: LineAssignment[] = [];
  const orphanPhrases: Phrase[] = [];
  let i = L;
  let j = P;
  while (i > 0 || j > 0) {
    const op = bt[i][j];
    if (!op) break;
    if (op.op === 'match') {
      assignments.push({ line: op.line, phrase: op.phrase });
      i--;
      j--;
    } else if (op.op === 'skipLine') {
      assignments.push({ line: op.line, phrase: null });
      i--;
    } else {
      orphanPhrases.push(op.phrase);
      j--;
    }
  }
  assignments.reverse();
  orphanPhrases.reverse();
  return { assignments, orphanPhrases };
}

/* ====================================================================== */
/* 字级对齐：一行之内 唱字 ↔ 音节，允许衬字(跳音节)/漏字(跳唱字)            */
/* ====================================================================== */

interface CharAlignResult {
  pairs: { charIndex: number; seg: Segment }[];
  extraSegs: Segment[];
  instrumentalSegs: Segment[];
  missingIndices: number[];
}

function alignCharsInLine(line: ScriptLine, phrase: Phrase): CharAlignResult {
  const chars = spokenChars(line.dialect);
  const segs = phrase.segs;
  const n = chars.length;
  const m = segs.length;
  if (n === 0)
    return { pairs: [], extraSegs: segs.filter((s) => !s.long), instrumentalSegs: segs.filter((s) => s.long), missingIndices: [] };

  const expDur = line.kind === 'speak' ? 0.185 : 0.4;
  // 盈余段数：只有多出至少两段时，才认为其中可能混着“器乐长音 + 衬字”；
  // 仅多一段时，句末长音按戏曲规律是末字拖腔，不可跳过。
  const surplus = m - n;
  const longSkipCost = surplus >= 2 ? 0.15 : 1.7;

  // 本行音节时长中位数：显著偏短的段通常是衬字（如句中“呀”）
  const durs = segs.filter((s) => !s.long).map((s) => s.dur).sort((a, b) => a - b);
  const median = durs.length ? durs[Math.floor(durs.length / 2)] : expDur;
  const fillerLike = (s: Segment): boolean => {
    if (s.long) return false;
    const short = s.dur < Math.min(median * 0.66, expDur * 0.72);
    // 衬字常以低八度/较弱的含糊音色唱出，高频能量比明显偏低
    const dark = s.hfMean > 0 && s.hfMean < 0.085;
    return short || dark;
  };

  // 边界衬字优先：句首/句尾的跳段成本略低
  const extraCost = (seg: Segment, j: number): number => {
    if (seg.long) return longSkipCost;
    if (fillerLike(seg)) return 0.14;
    if (j === 0 || j === m - 1) return 0.15;
    const boundary = j <= 1 || j >= m - 2;
    return boundary ? 0.24 : 0.45;
  };
  const MISS_CHAR = 0.8;

  const matchCost = (seg: Segment): number => {
    const d = Math.max(0.07, seg.dur);
    let c = 0.85 * Math.min(1.6, Math.abs(Math.log(d / expDur)));
    if (fillerLike(seg)) c += 0.9; // 短衬字不应匹配正字
    // 拖腔长音：可以匹配，但保留适度成本，使“多出来的长音”倾向于被跳过
    if (d > 2.5) c = Math.min(c, 0.7);
    else if (d > 1.2) c = Math.min(c, 0.3);
    return c;
  };

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const bt: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  dp[0][0] = 0;
  for (let a = 1; a <= n; a++) {
    dp[a][0] = dp[a - 1][0] + MISS_CHAR;
    bt[a][0] = 1; // miss
  }
  for (let b = 1; b <= m; b++) {
    dp[0][b] = dp[0][b - 1] + extraCost(segs[b - 1], b - 1);
    bt[0][b] = 2; // extra seg
  }
  for (let a = 1; a <= n; a++) {
    for (let b = 1; b <= m; b++) {
      const match = dp[a - 1][b - 1] + matchCost(segs[b - 1]);
      const miss = dp[a - 1][b] + MISS_CHAR;
      const extra = dp[a][b - 1] + extraCost(segs[b - 1], b - 1);
      const best = Math.min(match, miss, extra);
      dp[a][b] = best;
      if (best === match) bt[a][b] = 0;
      else if (best === miss) bt[a][b] = 1;
      else bt[a][b] = 2;
    }
  }

  const pairs: { charIndex: number; seg: Segment }[] = [];
  const extraSegs: Segment[] = [];
  const missingIndices: number[] = [];
  let a = n;
  let b = m;
  while (a > 0 || b > 0) {
    const op = a > 0 && b > 0 ? bt[a][b] : a > 0 ? 1 : 2;
    if (op === 0) {
      pairs.push({ charIndex: a - 1, seg: segs[b - 1] });
      a--;
      b--;
    } else if (op === 1) {
      missingIndices.push(a - 1);
      a--;
    } else {
      extraSegs.push(segs[b - 1]);
      b--;
    }
  }
  pairs.reverse();
  extraSegs.reverse();
  missingIndices.reverse();
  const instrumentalSegs = extraSegs.filter((s) => s.long);
  const fillerSegs = extraSegs.filter((s) => !s.long);
  return { pairs, extraSegs: fillerSegs, instrumentalSegs, missingIndices };
}

/* ====================================================================== */
/* 生成 Cue / AlignedChar                                                  */
/* ====================================================================== */

let idCounter = 0;
function acid(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

function buildCues(
  assignments: LineAssignment[],
  orphanPhrases: Phrase[],
): { cues: Cue[]; matched: number; extra: number; instrumentalSpans: PercRegion[] } {
  const cues: Cue[] = [];
  const instrumentalSpans: PercRegion[] = [];
  let matched = 0;
  let extra = 0;

  // 无唱本对应的孤立短语：音节密集 -> 临场加句（灰字）；否则按器乐/锣鼓尾处理
  for (const ph of orphanPhrases) {
    const dense = ph.segs.filter((s) => !s.long).length >= 4;
    if (dense) {
      const chars: AlignedChar[] = ph.segs.map((s) => ({
        id: acid('ac_'),
        ch: '衬',
        start: s.start,
        end: s.end,
        status: 'extra',
        longDrag: s.dur >= LONG_DRAG_SECONDS,
      }));
      extra += chars.length;
      cues.push({
        id: acid('cue_'),
        lineId: null,
        kind: 'sing',
        start: ph.start,
        end: ph.end,
        chars,
        mandarin: '',
        improvised: true,
      });
    } else {
      instrumentalSpans.push({ start: ph.start, end: ph.end });
    }
  }

  for (const asg of assignments) {
    const line = asg.line;
    if (!asg.phrase) continue; // 漏句：不生成 cue，UI 据 script 差集标黄

    const result = alignCharsInLine(line, asg.phrase);
    for (const s of result.instrumentalSegs) instrumentalSpans.push({ start: s.start, end: s.end });
    const charsText = spokenChars(line.dialect);
    const aligned: AlignedChar[] = [];

    for (const p of result.pairs) {
      aligned.push({
        id: acid('ac_'),
        ch: charsText[p.charIndex],
        start: p.seg.start,
        end: p.seg.end,
        status: 'matched',
        lineId: line.id,
        charIndex: p.charIndex,
        longDrag: p.seg.dur >= LONG_DRAG_SECONDS,
      });
      matched++;
    }
    for (const idx of result.missingIndices) {
      const neighbor =
        result.pairs.find((p) => p.charIndex === idx - 1)?.seg ??
        result.pairs.find((p) => p.charIndex === idx + 1)?.seg;
      const t = neighbor ? (neighbor.start + neighbor.end) / 2 : asg.phrase.start;
      aligned.push({
        id: acid('ac_'),
        ch: charsText[idx],
        start: t,
        end: t,
        status: 'missing',
        lineId: line.id,
        charIndex: idx,
      });
    }
    // 衬字按时间插入序列
    for (const s of result.extraSegs) {
      aligned.push({
        id: acid('ac_'),
        ch: '衬',
        start: s.start,
        end: s.end,
        status: 'extra',
        lineId: line.id,
        longDrag: s.dur >= LONG_DRAG_SECONDS,
      });
      extra++;
    }
    aligned.sort((x, y) => x.start - y.start);

    const timed = aligned.filter((c) => c.status !== 'missing');
    const start = timed.length ? Math.min(...timed.map((c) => c.start)) : asg.phrase.start;
    const end = timed.length ? Math.max(...timed.map((c) => c.end)) : asg.phrase.end;

    cues.push({
      id: acid('cue_'),
      lineId: line.id,
      kind: line.kind,
      role: line.role,
      start,
      end,
      chars: aligned,
      mandarin: line.mandarin,
    });
  }

  cues.sort((a, b) => a.start - b.start);
  return { cues, matched, extra, instrumentalSpans };
}

/* ====================================================================== */
/* 过门区间                                                                */
/* ====================================================================== */

function buildGaps(
  cues: Cue[],
  perc: PercRegion[],
  frames: Frame[],
  duration: number,
  instrumentalSpans: PercRegion[] = [],
): GapRegion[] {
  const gaps: GapRegion[] = [];

  for (const p of perc) {
    gaps.push({ id: acid('gap_'), start: p.start, end: Math.min(duration, p.end), type: 'luogu', label: '锣鼓过门' });
  }
  for (const s of instrumentalSpans) {
    if (s.end - s.start >= 1.4) {
      gaps.push({ id: acid('gap_'), start: s.start, end: Math.min(duration, s.end), type: 'instrumental', label: '器乐过门' });
    }
  }

  // 字幕窗口之外的长区间
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const intervals: [number, number][] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.start - cursor >= 1.0) intervals.push([cursor, c.start]);
    cursor = Math.max(cursor, c.end);
  }
  if (duration - cursor >= 1.0) intervals.push([cursor, duration]);

  for (const [s, e] of intervals) {
    if (e - s < 1.0) continue;
    const midPerc = perc.some((p) => p.start < e && p.end > s);
    if (midPerc) continue; // 已由锣鼓区间覆盖
    const type = classifyInterval(frames, s, e);
    gaps.push({
      id: acid('gap_'),
      start: s,
      end: e,
      type,
      label: type === 'luogu' ? '锣鼓过门' : type === 'instrumental' ? '器乐过门' : '停顿',
    });
  }

  // 合并重叠/相邻同类
  gaps.sort((a, b) => a.start - b.start);
  const merged: GapRegion[] = [];
  for (const g of gaps) {
    const last = merged[merged.length - 1];
    if (last && g.start <= last.end + 0.25) {
      last.end = Math.max(last.end, g.end);
      if (last.type === 'silence' && g.type !== 'silence') {
        last.type = g.type;
        last.label = g.label;
      }
    } else merged.push({ ...g });
  }
  return merged;
}

function classifyInterval(frames: Frame[], s: number, e: number): GapType {
  const inRange = frames.filter((f) => f.t >= s && f.t <= e);
  if (!inRange.length) return 'silence';
  const noisyRatio = inRange.filter((f) => f.zcr > 0.13 && f.hf > 0.9).length / inRange.length;
  const activeRatio = inRange.filter((f) => f.rms > 0.05).length / inRange.length;
  if (noisyRatio > 0.3) return 'luogu';
  if (activeRatio > 0.35) return 'instrumental';
  return 'silence';
}

/* ====================================================================== */
/* 字幕窗口策略：拖腔保持、锣鼓留白、最小可读时长、相邻不重叠                 */
/* ====================================================================== */

/** 该 cue 中超过 3 秒的拖腔字所要求的最早结束时间 */
export function minimumCueEnd(cue: Cue): number {
  let minEnd = cue.end;
  for (const c of cue.chars) {
    if (c.status === 'missing') continue;
    if (c.end - c.start >= LONG_DRAG_SECONDS) minEnd = Math.max(minEnd, c.end + 0.45);
  }
  return minEnd;
}

export function finalizeWindows(cues: Cue[], gaps: GapRegion[]): void {
  for (const cue of cues) {
    const timed = cue.chars.filter((c) => c.status !== 'missing');
    const rawStart = timed.length ? Math.min(...timed.map((c) => c.start)) : cue.start;
    const rawEnd = timed.length ? Math.max(...timed.map((c) => c.end)) : cue.end;

    cue.start = Math.max(0, rawStart - 0.12);
    cue.end = Math.max(rawEnd + 0.42, minimumCueEnd(cue));

    // 最短可读 1.3 秒
    if (cue.end - cue.start < 1.3) cue.end = cue.start + 1.3;

    // 锣鼓 / 纯器乐过门强制留白：字幕尾不得压进过门；但若拖腔/字音本身延续，
    // 至少保留到字音结束，保证“拖腔长的字字幕不提前消失”。
    for (const g of gaps) {
      if (g.type === 'silence') continue;
      const voiceEnd = rawEnd;
      if (cue.start < g.start && cue.end > g.start && rawEnd <= g.start + 0.3) {
        const cut = Math.min(cue.end, g.start - 0.07);
        cue.end = Math.max(voiceEnd + 0.05, cut);
      }
    }
  }

  // 相邻 cue 不重叠
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    const cur = cues[i];
    const next = cues[i + 1];
    if (cur.end > next.start - 0.06) {
      const required = minimumCueEnd(cur);
      const cap = next.start - 0.06;
      cur.end = cap >= required - 0.01 ? cap : Math.max(required, next.start - 0.02);
      // 若拖腔硬约束仍与下句冲突，保留下句起点，拖腔 cue 延伸到重叠区也不提前消失
      if (cur.end > next.start) cur.end = required;
    }
  }
}

/* ====================================================================== */
/* 调试钩子                                                                */
/* ====================================================================== */

export function debugPipeline(
  samples: Float32Array,
  sampleRate: number,
  options: AlignOptions = DEFAULT_ALIGN_OPTIONS,
) {
  const frames = extractFrames(samples, sampleRate);
  const perc = detectPercussion(frames, sampleRate);
  const segs = detectSyllables(frames, perc, options, sampleRate);
  const phrases = groupPhrases(segs, options.lineGap);
  return { frames, perc, segs, phrases };
}

/* ====================================================================== */
/* 两小时规模性能自检（不分配 2 小时 PCM）                                  */
/* ====================================================================== */

export interface BenchResult {
  chars: number;
  segments: number;
  phrases: number;
  dpMs: number;
  featureThroughputX: number;
  estimatedTwoHoursMs: number;
  budgetMs: number;
  pass: boolean;
}

export function benchmarkTwoHours(): BenchResult {
  // 以真实渲染的 60 秒音频测特征吞吐，再外推
  const sr = 22050;
  const oneMin = new Float32Array(sr * 60);
  for (let i = 0; i < oneMin.length; i++) oneMin[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.1;
  const f0 = now();
  const frames = extractFrames(oneMin, sr);
  detectPercussion(frames, sr);
  const featureMs60s = now() - f0;

  // 构造 2 小时量级的唱字/音节（约 12000 字、340 句）
  const lineCount = 340;
  const charsPerLine = 35;
  const script: ScriptLine[] = [];
  const phrases: Phrase[] = [];
  let segCursor = 0;
  for (let l = 0; l < lineCount; l++) {
    const text = '字'.repeat(charsPerLine);
    script.push({ id: `b${l}`, kind: l % 4 === 0 ? 'speak' : 'sing', dialect: text, mandarin: '' });
    const segs: Segment[] = [];
    for (let c = 0; c < charsPerLine + (l % 17 === 0 ? 2 : 0); c++) {
      segs.push({ start: segCursor * 0.42, end: segCursor * 0.42 + 0.34, dur: 0.34, long: false, hfMean: 0.2 });
      segCursor++;
    }
    phrases.push({ start: segs[0].start, end: segs[segs.length - 1].end, segs });
  }

  const d0 = now();
  const { assignments } = alignLinesToPhrases(script, phrases);
  for (const a of assignments) if (a.phrase) alignCharsInLine(a.line, a.phrase);
  const dpMs = now() - d0;

  const featureThroughputX = 60000 / Math.max(1, featureMs60s); // 实时倍率
  const featureTwoHoursMs = featureMs60s * 120;
  const estimatedTwoHoursMs = Math.round(featureTwoHoursMs + dpMs);
  return {
    chars: lineCount * charsPerLine,
    segments: segCursor,
    phrases: lineCount,
    dpMs: Math.round(dpMs),
    featureThroughputX: Math.round(featureThroughputX),
    estimatedTwoHoursMs,
    budgetMs: 5 * 60 * 1000,
    pass: estimatedTwoHoursMs < 5 * 60 * 1000,
  };
}
