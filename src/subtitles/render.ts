// 把唱本原文（含标点）与对齐字（含灰字衬字）合并成有序渲染序列，
// 以及带标点、带衬字的导出台词文本。

import type { ScriptLine, TimeChar } from '../types';

export type RenderItem = { kind: 'char'; ch: TimeChar } | { kind: 'punct'; text: string };

export function isTokenChar(ch: string): boolean {
  return /[一-鿿A-Za-z0-9]/.test(ch);
}
export function lineRenderItems(line: ScriptLine, chars: TimeChar[]): RenderItem[] {
  const byIndex = new Map<number, TimeChar>();
  const adlibs: TimeChar[] = [];
  for (const c of chars) {
    if (c.adlib) adlibs.push(c);
    else byIndex.set(c.indexInLine, c);
  }
  adlibs.sort(
    (a, b) => (a.afterIndex ?? 0) - (b.afterIndex ?? 0) || a.start - b.start,
  );

  const out: RenderItem[] = [];
  let tokenCount = 0;
  let adlibPos = 0;
  const emitAdlibs = (k: number) => {
    while (adlibPos < adlibs.length && (adlibs[adlibPos].afterIndex ?? 0) === k) {
      out.push({ kind: 'char', ch: adlibs[adlibPos] });
      adlibPos++;
    }
  };

  emitAdlibs(0);
  for (const raw of Array.from(line.dialect)) {
    if (isTokenChar(raw)) {
      const c = byIndex.get(tokenCount);
      if (c) out.push({ kind: 'char', ch: c });
      else out.push({ kind: 'punct', text: raw });
      tokenCount++;
      emitAdlibs(tokenCount);
    } else {
      out.push({ kind: 'punct', text: raw });
    }
  }
  emitAdlibs(tokenCount);
  while (adlibPos < adlibs.length) {
    out.push({ kind: 'char', ch: adlibs[adlibPos++] });
  }
  return out;
}

export function composeDialect(line: ScriptLine, chars: TimeChar[]): string {
  return lineRenderItems(line, chars)
    .map((i) => (i.kind === 'char' ? i.ch.ch : i.text))
    .join('');
}
