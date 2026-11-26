import type { AlignmentResult, Cue, ScriptLine } from '../types/domain';
import { toASSTime, toSRTTime, toVTTTime } from './time';
import { wrapLine } from './text';

export interface ExportOptions {
  /** 方言每行最多字数 */
  maxChars: number;
  /** 是否附加普通话释义行 */
  bilingual: boolean;
  /** SRT 是否写 UTF-8 BOM（老版 Windows 播放器更稳） */
  bom: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  maxChars: 16,
  bilingual: true,
  bom: true,
};

export interface CueToken {
  text: string;
  kind: 'normal' | 'extra' | 'missing' | 'punct';
}

/**
 * 依据 cue.chars 与唱本原句，重建带标点的 token 序列，
 * 并把临场衬字（extra）按时间顺序插回相邻正字之间。
 */
export function cueTokens(cue: Cue, line?: ScriptLine): CueToken[] {
  if (cue.dialectText && cue.dialectText.trim()) {
    return [{ text: cue.dialectText, kind: 'normal' }];
  }
  if (!line) {
    return cue.chars
      .filter((c) => c.status !== 'missing')
      .map((c): CueToken => ({ text: c.ch, kind: c.status === 'extra' ? 'extra' : 'normal' }));
  }

  // 计算每个衬字应插在第几个正字之后（0..n）
  const matched = cue.chars
    .filter((c) => c.status === 'matched' && c.charIndex !== undefined)
    .sort((a, b) => a.start - b.start);
  const insertAfter = new Map<number, string[]>();
  for (const ex of cue.chars.filter((c) => c.status === 'extra')) {
    let k = 0;
    for (const m of matched) {
      if (m.start <= ex.start + 0.001) k = (m.charIndex ?? 0) + 1;
      else break;
    }
    if (!insertAfter.has(k)) insertAfter.set(k, []);
    insertAfter.get(k)!.push(ex.ch);
  }

  const tokens: CueToken[] = [];
  const pushExtras = (k: number) => {
    for (const ch of insertAfter.get(k) ?? []) tokens.push({ text: ch, kind: 'extra' });
  };

  pushExtras(0);
  let spokenCount = 0;
  const byIndex = new Map(cue.chars.filter((c) => c.charIndex !== undefined).map((c) => [c.charIndex, c]));
  for (const ch of line.dialect) {
    const isSpoken = /[一-鿿㐀-䶿豈-﫿a-zA-Z0-9]/.test(ch);
    if (isSpoken) {
      spokenCount++;
      const ac = byIndex.get(spokenCount - 1);
      tokens.push({ text: ch, kind: ac?.status === 'missing' ? 'missing' : 'normal' });
      pushExtras(spokenCount);
    } else {
      tokens.push({ text: ch, kind: 'punct' });
    }
  }
  // 末尾若还有未放置的衬字
  for (const [k, extras] of insertAfter) {
    if (k > spokenCount) for (const ch of extras) tokens.push({ text: ch, kind: 'extra' });
  }
  return tokens;
}

export function cueDialectText(cue: Cue, line?: ScriptLine): string {
  return cueTokens(cue, line)
    .map((t) => t.text)
    .join('');
}

/** 导出前整理：排序、去重叠、保证正时长 */
export function normalizeCuesForExport(result: AlignmentResult): Cue[] {
  const cues = [...result.cue].sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    c.start = Math.max(0, c.start);
    if (c.end <= c.start) c.end = c.start + 1;
    if (i + 1 < cues.length) {
      const next = cues[i + 1];
      if (c.end > next.start - 0.03) c.end = Math.max(c.start + 0.6, next.start - 0.05);
    }
  }
  return cues;
}

function cueLines(cue: Cue, line: ScriptLine | undefined, opts: ExportOptions) {
  const dialect = cueDialectText(cue, line);
  const dialectLines = wrapLine(dialect, opts.maxChars);
  const mandarin =
    opts.bilingual && cue.mandarin ? wrapLine(cue.mandarin, opts.maxChars + 5) : [];
  return { dialectLines, mandarin };
}

export function exportSRT(
  result: AlignmentResult,
  script: ScriptLine[],
  opts: ExportOptions,
): string {
  const lineById = new Map(script.map((l) => [l.id, l]));
  const cues = normalizeCuesForExport(result);
  const blocks: string[] = [];
  cues.forEach((cue, i) => {
    const line = cue.lineId ? lineById.get(cue.lineId) : undefined;
    const { dialectLines, mandarin } = cueLines(cue, line, opts);
    const text = [...dialectLines, ...mandarin].join('\n');
    blocks.push(`${i + 1}\n${toSRTTime(cue.start)} --> ${toSRTTime(cue.end)}\n${text}`);
  });
  const body = blocks.join('\r\n\r\n') + '\r\n';
  // SRT 传统上使用 CRLF；UTF-8 BOM 让 Windows 老播放器正确识别中文
  const crlf = body.replace(/\r?\n/g, '\r\n');
  return opts.bom ? '﻿' + crlf : crlf;
}

export function exportVTT(
  result: AlignmentResult,
  script: ScriptLine[],
  opts: ExportOptions,
): string {
  const lineById = new Map(script.map((l) => [l.id, l]));
  const cues = normalizeCuesForExport(result);
  const blocks: string[] = ['WEBVTT', '', 'STYLE', '::cue(.man){color:#ffd98a;font-size:.82em}', ''];
  cues.forEach((cue, i) => {
    const line = cue.lineId ? lineById.get(cue.lineId) : undefined;
    const { dialectLines, mandarin } = cueLines(cue, line, opts);
    const man = mandarin.length ? `<c.man>${mandarin.join(' ')}</c>` : '';
    const payload = [...dialectLines, man].filter(Boolean).join('\n');
    blocks.push(`${i + 1}`, `${toVTTTime(cue.start)} --> ${toVTTTime(cue.end)}`, payload, '');
  });
  return (opts.bom ? '﻿' : '') + blocks.join('\n');
}

function assEscape(s: string): string {
  return s.replace(/\{/g, '（').replace(/\}/g, '）').replace(/\r?\n/g, '\\N');
}

export function exportASS(
  result: AlignmentResult,
  script: ScriptLine[],
  opts: ExportOptions,
): string {
  const lineById = new Map(script.map((l) => [l.id, l]));
  const cues = normalizeCuesForExport(result);
  const header = `[Script Info]
Title: 皮影戏双语字幕
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Dialect,Microsoft YaHei,52,&H00F5F0E6,&H000000FF,&H641A120B,&H96000000,1,0,0,0,100,100,1,0,1,3,1.5,2,80,80,46,1
Style: Mandarin,Microsoft YaHei,34,&H008AD9FF,&H000000FF,&H641A120B,&H96000000,0,1,0,0,100,100,0,0,1,2,1,2,80,80,14,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events: string[] = [];
  for (const cue of cues) {
    const line = cue.lineId ? lineById.get(cue.lineId) : undefined;
    const { dialectLines, mandarin } = cueLines(cue, line, opts);
    let text = assEscape(dialectLines.join('\\N'));
    if (opts.bilingual && mandarin.length) {
      text += `\\N{\\rMandarin}${assEscape(mandarin.join(' '))}`;
    }
    const name = cue.role ? assEscape(cue.role) : '';
    events.push(
      `Dialogue: 0,${toASSTime(cue.start)},${toASSTime(cue.end)},Dialect,${name},0,0,0,,${text}`,
    );
  }
  return header + events.join('\n') + '\n';
}

export function exportJSON(result: AlignmentResult, script: ScriptLine[]): string {
  return JSON.stringify(
    {
      format: 'piying-alignment/1',
      exportedAt: new Date().toISOString(),
      script,
      ...result,
    },
    null,
    2,
  );
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
