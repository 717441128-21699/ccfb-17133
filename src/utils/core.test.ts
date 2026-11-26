import { describe, expect, it } from 'vitest';
import { countChars, parseScriptText, wrapLine } from './text';
import { toASSTime, toSRTTime } from './time';
import { exportSRT } from './subtitles';
import type { AlignmentResult, ScriptLine } from '../types/domain';

describe('wrapLine', () => {
  it('不超过最大字数', () => {
    const lines = wrapLine('河东城刮起了呼呼大风，半空中来了我齐天大圣。', 10);
    for (const l of lines) expect(countChars(l)).toBeLessThanOrEqual(11);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('短句保持一行', () => {
    expect(wrapLine('你好', 16)).toEqual(['你好']);
  });
});

describe('timecode', () => {
  it('SRT 进位正确', () => {
    expect(toSRTTime(0)).toBe('00:00:00,000');
    expect(toSRTTime(3661.5)).toBe('01:01:01,500');
    expect(toSRTTime(1.9999)).toBe('00:00:02,000');
  });
  it('ASS 厘秒', () => {
    expect(toASSTime(12.345)).toBe('0:00:12.35');
  });
});

describe('parseScriptText', () => {
  it('解析角色、唱白类型与普通话', () => {
    const text = '【孙悟空】（唱）河东城刮大风 || 河东刮起大风\n铁扇公主(白): 你这泼猴 || 你这猴子';
    const lines = parseScriptText(text);
    expect(lines).toHaveLength(2);
    expect(lines[0].role).toBe('孙悟空');
    expect(lines[0].kind).toBe('sing');
    expect(lines[0].mandarin).toContain('河东');
    expect(lines[1].kind).toBe('speak');
    expect(lines[1].role).toBe('铁扇公主');
  });
});

describe('exportSRT', () => {
  it('输出序号、时间码与双语内容', () => {
    const script: ScriptLine[] = [
      { id: 'l1', kind: 'sing', role: '角', dialect: '啊啊啊', mandarin: '意思' },
    ];
    const result: AlignmentResult = {
      cue: [
        {
          id: 'c1',
          lineId: 'l1',
          kind: 'sing',
          start: 1,
          end: 4.2,
          mandarin: '意思',
          chars: [
            { id: 'a', ch: '啊', start: 1, end: 2, status: 'matched' },
            { id: 'b', ch: '啊', start: 2, end: 3.5, status: 'matched' },
            { id: 'c', ch: '啊', start: 3.5, end: 4.2, status: 'matched' },
          ],
        },
      ],
      gaps: [],
      duration: 5,
      stats: {} as AlignmentResult['stats'],
      engine: 'test',
      alignedAt: 0,
    };
    const srt = exportSRT(result, script, { maxChars: 16, bilingual: true, bom: false }).replace(/\r\n/g, '\n');
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:04,200');
    expect(srt).toContain('啊啊啊');
    expect(srt).toContain('意思');
  });
});
