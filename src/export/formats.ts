// 通用字幕导出：SRT（CRLF + 可选 BOM，兼容常见播放器）、WebVTT、ASS（双语样式）、JSON。

import type { Cue, SubtitleOptions } from '../types';
import { toAssTime, toSrtTime, toVttTime, wrapLine } from '../lib/text';

export interface ExportOptions {
  subtitle: SubtitleOptions;
  /** SRT 加 UTF-8 BOM，提升 Windows 播放器兼容性 */
  bom: boolean;
  /** 导出哪些 cue（默认取 cue.exportEnabled） */
  onlyEnabled?: boolean;
}

function activeCues(cues: Cue[], opts: ExportOptions): Cue[] {
  return cues
    .filter((c) => {
      if (c.missingLine) return opts.subtitle.exportMissingLines;
      return opts.onlyEnabled === false ? true : c.exportEnabled;
    })
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
}

function dialectLines(cue: Cue, maxChars: number): string[] {
  return wrapLine(cue.dialect, maxChars);
}

function mandarinLines(cue: Cue, maxChars: number): string[] {
  if (!cue.mandarin) return [];
  return wrapLine(cue.mandarin, maxChars + 6);
}

export function toSrt(cues: Cue[], opts: ExportOptions): string {
  const max = opts.subtitle.maxCharsPerLine;
  const blocks: string[] = [];
  activeCues(cues, opts).forEach((cue, i) => {
    const textLines = [...dialectLines(cue, max)];
    if (opts.subtitle.showMandarin) textLines.push(...mandarinLines(cue, max));
    blocks.push(
      `${i + 1}\r\n${toSrtTime(cue.start)} --> ${toSrtTime(cue.end)}\r\n${textLines.join('\r\n')}`,
    );
  });
  return blocks.join('\r\n\r\n') + '\r\n';
}

export function toVtt(cues: Cue[], opts: ExportOptions): string {
  const max = opts.subtitle.maxCharsPerLine;
  const blocks: string[] = ['WEBVTT - 影戏字幕工坊双语字幕', ''];
  activeCues(cues, opts).forEach((cue, i) => {
    const textLines = [...dialectLines(cue, max)];
    if (opts.subtitle.showMandarin) textLines.push(...mandarinLines(cue, max));
    blocks.push(
      `${i + 1}`,
      `${toVttTime(cue.start)} --> ${toVttTime(cue.end)}`,
      textLines.join('\n'),
      '',
    );
  });
  return blocks.join('\n');
}

export function toAss(cues: Cue[], opts: ExportOptions): string {
  const max = opts.subtitle.maxCharsPerLine;
  const header = `[Script Info]
Title: 皮影戏双语字幕
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Dialect,Microsoft YaHei,64,&H00F5F0E6,&H000000FF,&H6420180A,&H96000000,-1,0,0,0,100,100,1,0,1,3.2,1.2,2,80,80,96,1
Style: Mandarin,Microsoft YaHei,40,&H00D8E6F0,&H000000FF,&H6420180A,&H96000000,0,0,0,0,100,100,0,0,1,2.4,1,2,100,100,34,1
Style: Missing,Microsoft YaHei,54,&H0033D7FF,&H000000FF,&H6420180A,&H96000000,0,1,0,0,100,100,0,0,1,2.4,1,2,80,80,96,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events: string[] = [];
  for (const cue of activeCues(cues, opts)) {
    const dLines = dialectLines(cue, max).join('\\N');
    const mLines = opts.subtitle.showMandarin ? mandarinLines(cue, max).join('\\N') : '';
    const style = cue.missingLine ? 'Missing' : 'Dialect';
    let text = dLines;
    if (mLines) text += `\\N{\\rMandarin}${mLines}`;
    if (cue.kind === 'speak') text = `{\\i1}${text}{\\i0}`;
    events.push(
      `Dialogue: 0,${toAssTime(cue.start)},${toAssTime(cue.end)},${style},,0,0,0,,${text}`,
    );
  }
  return header + events.join('\n') + '\n';
}

export function toProjectJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export function downloadTextFile(filename: string, text: string, mime: string, bom = false): void {
  const parts: BlobPart[] = [];
  if (bom) parts.push('﻿');
  parts.push(text);
  const blob = new Blob(parts, { type: `${mime};charset=utf-8` });
  triggerDownload(filename, blob);
}

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
