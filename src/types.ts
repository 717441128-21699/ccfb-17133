// 全局共享类型定义

export type LineKind = 'sing' | 'speak'; // 唱腔 | 道白

/** 唱本中的一行（一句） */
export interface ScriptLine {
  id: string;
  kind: LineKind;
  /** 方言唱词原文 */
  dialect: string;
  /** 普通话释义 */
  mandarin: string;
  /** 行当/角色提示，如「旦」「丑」 */
  role?: string;
}

/** 临场加的衬字 */
export interface AdLibSpec {
  lineId: string;
  /** 插在本行第 after 个正字之后（0 表示句首） */
  after: number;
  text: string;
}

/** 拖腔字（总时长秒，含拖腔） */
export interface LongToneSpec {
  lineId: string;
  charIndex: number;
  seconds: number;
}

/** 锣鼓过门 / 器乐段落 */
export interface PercussionSpec {
  /** 'start' 开场前奏；'end' 收台；否则为某行 id，表示该行之后 */
  anchor: 'start' | 'end' | string;
  seconds: number;
  kind: 'luogu' | 'instrumental';
  label?: string;
}

export interface PerformanceSpec {
  /** 艺人漏唱（整句）的行 id */
  skipLines?: string[];
  adLibs?: AdLibSpec[];
  longTones?: LongToneSpec[];
  percussions?: PercussionSpec[];
}

export interface Play {
  id: string;
  title: string;
  region: string;
  motif: string; // 视觉母题 key
  tagline: string;
  /** 剧中人 */
  roles: string[];
  lines: ScriptLine[];
  perf: PerformanceSpec;
}

/* ---------------- 对齐产物 ---------------- */

export type SegmentKind = 'sing' | 'speak' | 'percussion' | 'music' | 'unknown';

export interface AudioSegment {
  index: number;
  start: number;
  end: number;
  kind: SegmentKind;
  /** 自相关基频中位数 Hz，0 表示无稳定音高 */
  f0: number;
  clarity: number;
  zcr: number;
  energy: number;
  /** 合成示例音频中的音高锚点码（真实录音为 -1） */
  pitchCode: number;
  /** 高腔/甩腔/衬字特征 */
  ornament: boolean;
}

export interface TimeChar {
  id: string;
  ch: string;
  lineId: string;
  /** 在唱本本行中的字序；衬字为 -1 */
  indexInLine: number;
  /** 衬字专用：位于唱本第 afterIndex 个 token 之后（0 = 句首） */
  afterIndex?: number;
  start: number;
  end: number;
  /** 临场加唱的衬字 */
  adlib: boolean;
  /** 唱本有、录音未唱（整句漏唱时为 true） */
  missing: boolean;
  longTone: boolean;
  confidence: number;
  /** 衬字候选识别文本（灰字） */
  guess?: string;
}

export interface AlignedLine {
  lineId: string;
  kind: LineKind;
  start: number;
  end: number;
  /** false = 唱本有这一句，但录音里没唱 */
  matched: boolean;
  phraseIndex: number;
  charIds: string[];
}

export interface Interlude {
  start: number;
  end: number;
  kind: 'luogu' | 'instrumental';
  label: string;
}

export interface AlignStats {
  audioSeconds: number;
  scriptChars: number;
  detectedSegments: number;
  vocalSegments: number;
  phraseCount: number;
  matchedLines: number;
  missingLines: number;
  adlibCount: number;
  longToneCount: number;
  elapsedMs: number;
  engine: string;
}

export interface AlignResult {
  duration: number;
  chars: TimeChar[];
  lines: AlignedLine[];
  interludes: Interlude[];
  segments: AudioSegment[];
  stats: AlignStats;
}

export interface BenchReport {
  scriptChars: number;
  lineCount: number;
  segmentCount: number;
  elapsedMs: number;
  projectedTwoHourMs: number;
  note: string;
}

/* ---------------- 字幕 Cue ---------------- */

export interface Cue {
  id: string;
  lineId?: string;
  start: number;
  end: number;
  /** 方言原文（可能含 \n 自动断行） */
  dialect: string;
  /** 普通话释义 */
  mandarin: string;
  kind: LineKind;
  charIds: string[];
  /** 唱本有、艺人没唱 → 标黄 */
  missingLine: boolean;
  /** 用户手动改过时间 */
  manualTiming: boolean;
  /** 是否参与导出（漏唱句默认 false） */
  exportEnabled: boolean;
  /** 用户手动改过方言文本（关闭逐字灰字渲染） */
  textEdited?: boolean;
  longTone: boolean;
}

export interface SubtitleOptions {
  maxCharsPerLine: number;
  showMandarin: boolean;
  longToneThreshold: number;
  /** 拖腔收尾延长秒数 */
  holdTail: number;
  /** 普通句尾延长 */
  tail: number;
  /** 句首提前 */
  lead: number;
  exportMissingLines: boolean;
}

export interface AudioSourceInfo {
  name: string;
  duration: number;
  sampleRate: number;
  isSample: boolean;
  blobUrl?: string;
}
