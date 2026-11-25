// 两级模糊序列对齐：
// 1) 音频段按停顿聚成「乐句」，与唱本的「句」做带跳过/插入的全局 DP；
// 2) 命中的句内再做 字↔音节段 的 NW 对齐，识别漏字与临场衬字。
// 音高锚点码 / 时长 / 装饰音特征共同作为匹配代价，
// 因此个别衬字、漏句只会产生局部 gap，不会让整段错位。

import type {
  AlignedLine,
  AlignResult,
  AlignStats,
  AudioSegment,
  Interlude,
  ScriptLine,
  TimeChar,
} from '../types';
import { alignTokens } from '../lib/text';
import { pitchCodeOf, guessParticle } from '../audio/pitchcode';

const PHRASE_GAP = 0.42; // 句间停顿阈值（秒）

interface Phrase {
  index: number;
  start: number;
  end: number;
  segs: AudioSegment[];
  kind: 'sing' | 'speak';
}

interface CharOp {
  type: 'match' | 'delete' | 'insert';
  tokenIndex?: number;
  segIndex?: number; // 在 phrase.segs 中的下标
}

interface CharAlignResult {
  score: number;
  ops: CharOp[];
}

export function alignScript(
  lines: ScriptLine[],
  segments: AudioSegment[],
  duration: number,
  engineLabel = '能量分段 + 两级模糊 DP',
): AlignResult {
  const t0 = performanceNow();

  /* ---------- 锣鼓段 -> 过门 ---------- */
  const percSegs = segments.filter((s) => s.kind === 'percussion');
  const interludes: Interlude[] = mergePercussion(percSegs);

  /* ---------- 人声部 -> 乐句 ---------- */
  const vocalSegs = segments.filter((s) => s.kind === 'sing' || s.kind === 'speak');
  const phrases = buildPhrases(vocalSegs);

  /* ---------- 句 ↔ 乐句 DP（带状） ---------- */
  const lineDP = alignLinesToPhrases(lines, phrases);

  const chars: TimeChar[] = [];
  const alignedLines: AlignedLine[] = [];
  let charSeq = 0;
  const nextCharId = () => `tc_${charSeq++}`;

  const matchedPhrase = new Set<number>();

  for (const node of lineDP) {
    const line = lines[node.lineIndex];
    if (node.phraseIndex < 0) {
      // 整句漏唱
      const ids: string[] = [];
      const tokens = alignTokens(line.dialect);
      const est = estimateMissingTime(node.lineIndex, lineDP, lines, phrases);
      tokens.forEach((ch, i) => {
        const id = nextCharId();
        ids.push(id);
        chars.push({
          id,
          ch,
          lineId: line.id,
          indexInLine: i,
          start: est.start + i * est.each,
          end: est.start + (i + 1) * est.each - 0.04,
          adlib: false,
          missing: true,
          longTone: false,
          confidence: 0,
        });
      });
      alignedLines.push({
        lineId: line.id,
        kind: line.kind,
        start: est.start,
        end: Math.max(est.start + tokens.length * est.each, est.start + 0.4),
        matched: false,
        phraseIndex: -1,
        charIds: ids,
      });
      continue;
    }

    const phrase = phrases[node.phraseIndex];
    matchedPhrase.add(node.phraseIndex);
    const tokens = alignTokens(line.dialect);
    const ca = alignChars(tokens, phrase.segs, line.kind, true);
    const ids: string[] = [];

    // 先收集 op，删除字时间需要插值
    type Built = {
      id: string;
      ch: string;
      start: number;
      end: number;
      op: CharOp;
      seg?: AudioSegment;
      afterIndex?: number;
    };
    const built: Built[] = [];
    let tokensBefore = 0;
    for (const op of ca.ops) {
      if (op.type === 'match' && op.tokenIndex != null && op.segIndex != null) {
        const seg = phrase.segs[op.segIndex];
        const id = nextCharId();
        ids.push(id);
        built.push({ id, ch: tokens[op.tokenIndex], start: seg.start, end: seg.end, op, seg });
        tokensBefore = op.tokenIndex + 1;
      } else if (op.type === 'insert' && op.segIndex != null) {
        const seg = phrase.segs[op.segIndex];
        const ch = guessParticle(seg.pitchCode);
        const id = nextCharId();
        ids.push(id);
        built.push({ id, ch, start: seg.start, end: seg.end, op, seg, afterIndex: tokensBefore });
      } else if (op.type === 'delete' && op.tokenIndex != null) {
        const id = nextCharId();
        ids.push(id);
        built.push({ id, ch: tokens[op.tokenIndex], start: 0, end: 0, op });
        tokensBefore = op.tokenIndex + 1;
      }
    }
    // 漏字时间在相邻匹配字之间插值
    for (let i = 0; i < built.length; i++) {
      if (built[i].op.type !== 'delete') continue;
      let p = i - 1;
      while (p >= 0 && built[p].op.type === 'delete') p--;
      let q = i + 1;
      while (q < built.length && built[q].op.type === 'delete') q++;
      const a = p >= 0 ? built[p].end : phrase.start;
      const b = q < built.length ? built[q].start : phrase.end;
      const runStart = i;
      let runEnd = i;
      while (runEnd + 1 < built.length && built[runEnd + 1].op.type === 'delete') runEnd++;
      const k = runEnd - runStart + 1;
      const each = Math.max(0.12, (b - a) / (k + 1));
      for (let r = 0; r < k; r++) {
        const item = built[runStart + r];
        item.start = a + each * (r + 1) - each * 0.5;
        item.end = item.start + each * 0.8;
      }
      i = runEnd;
    }

    for (const b of built) {
      const isInsert = b.op.type === 'insert';
      const dur = b.end - b.start;
      chars.push({
        id: b.id,
        ch: b.ch,
        lineId: line.id,
        indexInLine: b.op.tokenIndex ?? -1,
        afterIndex: b.afterIndex,
        start: b.start,
        end: b.end,
        adlib: isInsert,
        missing: b.op.type === 'delete',
        longTone: !isInsert && dur >= 3,
        confidence: b.seg ? Math.max(0.3, Math.min(1, b.seg.clarity + 0.25)) : 0.2,
        guess: isInsert ? b.ch : undefined,
      });
    }

    alignedLines.push({
      lineId: line.id,
      kind: line.kind,
      start: phrase.start,
      end: phrase.end,
      matched: true,
      phraseIndex: phrase.index,
      charIds: ids,
    });
  }

  /* ---------- 未匹配乐句 = 器乐/加奏过门 ---------- */
  for (const p of phrases) {
    if (matchedPhrase.has(p.index)) continue;
    interludes.push({
      start: p.start,
      end: p.end,
      kind: 'instrumental',
      label: '器乐过门',
    });
  }
  interludes.sort((a, b) => a.start - b.start);
  const mergedInterludes: Interlude[] = [];
  for (const it of interludes) {
    const last = mergedInterludes[mergedInterludes.length - 1];
    if (last && it.start <= last.end + 0.6) {
      last.end = Math.max(last.end, it.end);
    } else mergedInterludes.push({ ...it });
  }

  // 统计
  const scriptCharCount = lines.reduce((n, l) => n + alignTokens(l.dialect).length, 0);
  const missingLines = alignedLines.filter((l) => !l.matched).length;
  const adlibCount = chars.filter((c) => c.adlib).length;
  const longToneCount = chars.filter((c) => c.longTone).length;
  const elapsedMs = performanceNow() - t0;

  const stats: AlignStats = {
    audioSeconds: duration,
    scriptChars: scriptCharCount,
    detectedSegments: segments.length,
    vocalSegments: vocalSegs.length,
    phraseCount: phrases.length,
    matchedLines: alignedLines.length - missingLines,
    missingLines,
    adlibCount,
    longToneCount,
    elapsedMs,
    engine: engineLabel,
  };

  return { duration, chars, lines: alignedLines, interludes: mergedInterludes, segments, stats };
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/* ---------------- 乐句 ---------------- */

function buildPhrases(segs: AudioSegment[]): Phrase[] {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  const phrases: Phrase[] = [];
  let cur: AudioSegment[] = [];
  for (const seg of sorted) {
    if (cur.length && seg.start - cur[cur.length - 1].end > PHRASE_GAP) {
      phrases.push(makePhrase(phrases.length, cur));
      cur = [];
    }
    cur.push(seg);
  }
  if (cur.length) phrases.push(makePhrase(phrases.length, cur));
  return phrases;
}

function makePhrase(index: number, segs: AudioSegment[]): Phrase {
  const singN = segs.filter((s) => s.kind === 'sing').length;
  const speakN = segs.length - singN;
  return {
    index,
    start: segs[0].start,
    end: segs[segs.length - 1].end,
    segs,
    kind: singN >= speakN ? 'sing' : 'speak',
  };
}

/* ---------------- 锣鼓合并 ---------------- */

function mergePercussion(segs: AudioSegment[]): Interlude[] {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  const out: Interlude[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start - last.end <= 0.9) {
      last.end = Math.max(last.end, s.end + 0.08);
    } else {
      out.push({ start: s.start, end: s.end + 0.08, kind: 'luogu', label: '锣鼓过门' });
    }
  }
  return out;
}

/* ---------------- 句级 DP ---------------- */

interface LineDPNode {
  lineIndex: number;
  phraseIndex: number; // -1 = 漏句
}

const SKIP_LINE = -26;
const EXTRA_PHRASE = -10;

function alignLinesToPhrases(lines: ScriptLine[], phrases: Phrase[]): LineDPNode[] {
  const L = lines.length;
  const P = phrases.length;
  const NEG = -1e9;
  const dp: number[][] = Array.from({ length: L + 1 }, () => new Array(P + 1).fill(NEG));
  const bt: number[][] = Array.from({ length: L + 1 }, () => new Array(P + 1).fill(0));
  // bt: 1=diag 2=skip line 3=extra phrase
  dp[0][0] = 0;
  for (let i = 1; i <= L; i++) {
    dp[i][0] = dp[i - 1][0] + SKIP_LINE;
    bt[i][0] = 2;
  }
  for (let j = 1; j <= P; j++) {
    dp[0][j] = dp[0][j - 1] + EXTRA_PHRASE;
    bt[0][j] = 3;
  }

  for (let i = 1; i <= L; i++) {
    const tokens = alignTokens(lines[i - 1].dialect);
    for (let j = 1; j <= P; j++) {
      // 候选 1：句 ↔ 乐句
      let best = dp[i - 1][j - 1];
      let move = 1;
      if (best > NEG / 2) {
        const ca = alignChars(tokens, phrases[j - 1].segs, lines[i - 1].kind, false);
        const kindBonus = phrases[j - 1].kind === lines[i - 1].kind ? 5 : -4;
        best += ca.score + kindBonus;
      } else best = NEG;

      // 候选 2：漏句
      const v2 = dp[i - 1][j] + SKIP_LINE;
      if (v2 > best) {
        best = v2;
        move = 2;
      }
      // 候选 3：额外乐句
      const v3 = dp[i][j - 1] + EXTRA_PHRASE;
      if (v3 > best) {
        best = v3;
        move = 3;
      }
      dp[i][j] = best;
      bt[i][j] = move;
    }
  }

  // 回溯（按唱本顺序输出）
  const nodesRev: LineDPNode[] = [];
  let i = L;
  let j = P;
  while (i > 0 || j > 0) {
    const move = i > 0 && j > 0 ? bt[i][j] : i > 0 ? 2 : 3;
    if (move === 1) {
      nodesRev.push({ lineIndex: i - 1, phraseIndex: j - 1 });
      i--;
      j--;
    } else if (move === 2) {
      nodesRev.push({ lineIndex: i - 1, phraseIndex: -1 });
      i--;
    } else {
      j--;
    }
  }
  return nodesRev.reverse();
}

function estimateMissingTime(
  lineIndex: number,
  nodes: LineDPNode[],
  lines: ScriptLine[],
  phrases: Phrase[],
): { start: number; each: number } {
  // 找前后命中句的时间
  let prevEnd = 0;
  let nextStart = -1;
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (n.lineIndex === lineIndex && n.phraseIndex < 0) {
      for (let a = k - 1; a >= 0; a--) {
        if (nodes[a].phraseIndex >= 0) {
          prevEnd = phrases[nodes[a].phraseIndex].end;
          break;
        }
      }
      for (let b = k + 1; b < nodes.length; b++) {
        if (nodes[b].phraseIndex >= 0) {
          nextStart = phrases[nodes[b].phraseIndex].start;
          break;
        }
      }
      break;
    }
  }
  const n = alignTokens(lines[lineIndex].dialect).length;
  let start = prevEnd + 0.25;
  let each = 0.34;
  if (nextStart > 0) {
    const room = nextStart - 0.2 - start;
    if (room > n * 0.22) each = Math.min(0.5, room / n);
    else if (room > 0.3) each = room / n;
    else start = Math.max(0, nextStart - n * each - 0.2);
  }
  return { start, each };
}

/* ---------------- 字 ↔ 音节 NW ---------------- */

function matchScore(ch: string, seg: AudioSegment, lineKind: 'sing' | 'speak'): number {
  let s = 0;
  if (seg.pitchCode >= 0) {
    const code = pitchCodeOf(ch);
    let d = Math.abs(code - seg.pitchCode);
    d = Math.min(d, 12 - d);
    if (d === 0) s += 10;
    else if (d === 1) s += 3;
    else if (d === 2) s += 0.5;
    else s -= 1.5;
  }
  // 时长合理性（轻微）
  const expected = lineKind === 'speak' ? 0.19 : 0.54;
  const dur = seg.end - seg.start;
  const logD = Math.abs(Math.log(dur / expected));
  s -= Math.min(2, logD * 0.8);
  if (seg.ornament) s -= 6; // 装饰音段不该匹配正字
  if (seg.kind !== lineKind && !(lineKind === 'sing' && seg.kind === 'speak')) s -= 1.5;
  return s;
}

function insertionCost(seg: AudioSegment): number {
  if (seg.ornament) return -0.5; // 大概率衬字
  return -4.5;
}

function alignChars(tokens: string[], segs: AudioSegment[], lineKind: 'sing' | 'speak', trace: boolean): CharAlignResult {
  const n = tokens.length;
  const m = segs.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  // 仅在需要回溯时分配方向表（句级 DP 只取分数，省掉大量分配）
  const bt: Uint8Array[] | null = trace
    ? Array.from({ length: n + 1 }, () => new Uint8Array(m + 1))
    : null;
  // 1 diag 2 delete token 3 insert seg
  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] - 7;
    if (bt) bt[i][0] = 2;
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] + insertionCost(segs[j - 1]);
    if (bt) bt[0][j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + matchScore(tokens[i - 1], segs[j - 1], lineKind);
      const del = dp[i - 1][j] - 7;
      const ins = dp[i][j - 1] + insertionCost(segs[j - 1]);
      let best = diag;
      let move = 1;
      if (del > best) {
        best = del;
        move = 2;
      }
      if (ins > best) {
        best = ins;
        move = 3;
      }
      dp[i][j] = best;
      if (bt) bt[i][j] = move;
    }
  }
  const score = dp[n][m];
  if (!trace || !bt) return { score, ops: [] };

  const opsRev: CharOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && bt[i][j] === 1) {
      opsRev.push({ type: 'match', tokenIndex: i - 1, segIndex: j - 1 });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || bt[i][j] === 2)) {
      opsRev.push({ type: 'delete', tokenIndex: i - 1 });
      i--;
    } else {
      opsRev.push({ type: 'insert', segIndex: j - 1 });
      j--;
    }
  }
  return { score, ops: opsRev.reverse() };
}
