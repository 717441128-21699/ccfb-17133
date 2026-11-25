// 从对齐结果生成字幕 Cue，落实四条硬规则：
// 1) 按 maxCharsPerLine 自动断行（展示/导出时 wrapLine）；
// 2) 拖腔字（>= longToneThreshold）所在 cue 的结束时间必须覆盖整个拖腔并留 tail；
// 3) cue 时间避让锣鼓/器乐过门，过门期间屏幕无字幕；
// 4) 漏唱整句 -> missingLine 黄色提醒，默认不导出；衬字保留在 charIds 中供灰字渲染。

import type { AlignResult, Cue, ScriptLine, SubtitleOptions, TimeChar } from '../types';
import { clamp } from '../lib/text';
import { composeDialect } from './render';

export const DEFAULT_SUBTITLE_OPTIONS: SubtitleOptions = {
  maxCharsPerLine: 15,
  showMandarin: true,
  longToneThreshold: 3,
  holdTail: 0.6,
  tail: 0.28,
  lead: 0.12,
  exportMissingLines: false,
};

export function buildCues(
  script: ScriptLine[],
  result: AlignResult,
  opts: SubtitleOptions,
): Cue[] {
  const charsByLine = new Map<string, TimeChar[]>();
  for (const c of result.chars) {
    if (!charsByLine.has(c.lineId)) charsByLine.set(c.lineId, []);
    charsByLine.get(c.lineId)!.push(c);
  }

  const cues: Cue[] = [];
  script.forEach((line, idx) => {
    const aligned = result.lines.find((l) => l.lineId === line.id);
    const lineChars = charsByLine.get(line.id) ?? [];
    const missingLine = !aligned?.matched;

    let start = aligned?.start ?? lineChars[0]?.start ?? idx * 4;
    let end = aligned?.end ?? lineChars[lineChars.length - 1]?.end ?? start + 2;

    if (!missingLine && lineChars.length) {
      const spoken = lineChars;
      start = spoken[0].start - opts.lead;
      end = spoken[spoken.length - 1].end + opts.tail;

      // 拖腔保持：包含 >= 阈值长音时，字幕不得提前消失
      const longChars = spoken.filter((c) => !c.adlib && c.end - c.start >= opts.longToneThreshold);
      for (const lc of longChars) {
        end = Math.max(end, lc.end + opts.holdTail);
      }
    }

    // 最小展示时长 0.9s（仅在不撞过门/下一句时延长）
    if (end - start < 0.9) end = start + 0.9;

    // 过门避让：cue 不得与 interlude 相交
    for (const it of result.interludes) {
      if (start < it.end && end > it.start) {
        if (start >= it.start - 0.05 && start < it.end) {
          start = it.end + 0.08; // 起点扎在过门里 -> 推到过门后
        }
        if (end > it.start && end <= it.end + 0.2) {
          end = it.start - 0.06; // 终点越过过门起点 -> 收在过门前
        }
        if (start < it.start && end > it.end) {
          end = it.start - 0.06; // 整个包住过门 -> 截断（极端情况）
        }
      }
      // lead 不得伸入前一个过门
      if (start < it.end && start > it.start && end > it.end) start = it.end + 0.08;
    }
    if (end <= start + 0.2) end = start + 0.6;
    start = Math.max(0, start);
    end = clamp(end, 0, result.duration + 1);

    const hasLongTone = lineChars.some((c) => c.longTone);

    cues.push({
      id: `cue_${line.id}`,
      lineId: line.id,
      start: round3(start),
      end: round3(end),
      dialect: composeDialect(line, lineChars),
      mandarin: line.mandarin,
      kind: line.kind,
      charIds: lineChars.map((c) => c.id),
      missingLine,
      manualTiming: false,
      exportEnabled: missingLine ? opts.exportMissingLines : true,
      longTone: hasLongTone,
    });
  });

  return cues.sort((a, b) => a.start - b.start);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** 检查 cue 与过门的时间冲突（自测/界面告警用） */
export function findInterludeConflicts(
  cues: Cue[],
  interludes: { start: number; end: number }[],
): { cueId: string; start: number; end: number }[] {
  const conflicts: { cueId: string; start: number; end: number }[] = [];
  for (const cue of cues) {
    if (!cue.exportEnabled) continue;
    for (const it of interludes) {
      // 允许 60ms 边界误差
      if (cue.start < it.end - 0.06 && cue.end > it.start + 0.06) {
        conflicts.push({ cueId: cue.id, start: cue.start, end: cue.end });
        break;
      }
    }
  }
  return conflicts;
}
