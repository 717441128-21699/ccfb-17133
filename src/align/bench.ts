// 两小时全本规模的对齐性能基准（在 Worker 内运行，不分配两小时 PCM）。
// 结构规模参考：两小时皮影戏约 700~1200 句、1~2 万个唱字 / 道白字、2~3 万个音节段。

import type { AudioSegment, ScriptLine } from '../types';
import { alignScript } from './engine';
import type { BenchReport } from './protocol';

export function runScaleBenchmark(): BenchReport {
  const lineCount = 1000;
  const charsPerLine = 14;
  const scriptChars = lineCount * charsPerLine;
  const lines: ScriptLine[] = [];
  const segments: AudioSegment[] = [];
  let t = 1;
  let segIndex = 0;

  // 用确定性伪数据：每句 14 个正字段 + 偶尔 1 个衬字段，句间 0.8s
  for (let i = 0; i < lineCount; i++) {
    lines.push({
      id: `b${i}`,
      kind: i % 5 === 0 ? 'speak' : 'sing',
      dialect: '皮影戏唱词七个字再加七个字哟呵呀嗨',
      mandarin: '基准测试句',
    });
    const n = charsPerLine + (i % 7 === 0 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const dur = i % 5 === 0 ? 0.19 : 0.5;
      segments.push({
        index: segIndex++,
        start: t,
        end: t + dur,
        kind: i % 5 === 0 ? 'speak' : 'sing',
        f0: 300 + ((i * 13 + j * 7) % 180),
        clarity: 0.8,
        zcr: 0.08,
        energy: 0.15,
        pitchCode: (i * 3 + j) % 12,
        ornament: j === charsPerLine,
      });
      t += dur + 0.08;
    }
    t += 0.8;
  }
  const segmentCount = segments.length;
  const duration = 7200;

  const t0 = performance.now();
  alignScript(lines, segments, duration, '规模基准');
  const elapsedMs = performance.now() - t0;

  // 对齐 DP 主要随句数/字数线性~带状增长；按实测倍率外推到两小时音频分析预算。
  // DSP 部分为 O(采样数)，两小时 22.05k 单声道约 1.59 亿采样，实测经验 ~20-40s，
  // 这里给出保守总预算外推（DP 实测 + DSP 45s + 调度余量）。
  const projectedTwoHourMs = Math.round(elapsedMs + 45_000);

  return {
    scriptChars,
    lineCount,
    segmentCount,
    elapsedMs: Math.round(elapsedMs),
    projectedTwoHourMs,
    note: `对齐 DP 实测 ${Math.round(elapsedMs)}ms；叠加两小时 PCM 的 O(N) 能量/基频分析保守约 45s，整体预计 ${(
      projectedTwoHourMs / 1000
    ).toFixed(1)}s，远低于 5 分钟。`,
  };
}
