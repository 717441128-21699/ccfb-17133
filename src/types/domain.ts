/** 唱腔 / 道白 */
export type VocalKind = 'sing' | 'speak';

/** 唱本中的一行（一句唱或一段白） */
export interface ScriptLine {
  id: string;
  kind: VocalKind;
  /** 角色名，如 孙悟空 / 铁扇公主 */
  role?: string;
  /** 方言唱词/白口原文 */
  dialect: string;
  /** 普通话释义 */
  mandarin: string;
}

/** 锣鼓过门 / 器乐段落 / 静默 */
export type GapType = 'luogu' | 'instrumental' | 'silence';

/** 临场加入的衬字（唱本里没有） */
export interface PerfExtra {
  /** 插在本行第 after 个正字之后（按可发音字符计，0 表示最前） */
  after: number;
  ch: string;
  dur?: number;
  kind?: VocalKind;
}

/** 一行在“演出录音”里的实现方式（用于自编示例录音与合成） */
export interface PerfLine {
  lineId: string;
  /** 艺人是否实际演唱/念白，false = 漏句（对齐后应标黄） */
  sung?: boolean;
  /** 每个字的基础时长（秒），覆盖剧种默认值 */
  charDur?: number;
  /** 第 i 个字的拖腔延长秒数（一个字拖很长仍算同一个字） */
  drag?: Record<number, number>;
  /** 临场加的衬字 */
  extras?: PerfExtra[];
  /** 本行结束后的过门 */
  gapAfter?: { sec: number; type: GapType };
}

export interface PerfPlan {
  intro?: { sec: number; type: GapType };
  outro?: { sec: number; type: GapType };
  /** 各行的演出处理，key = ScriptLine.id */
  lines: Record<string, PerfLine>;
}

export interface Show {
  id: string;
  title: string;
  /** 影戏流派，如 秦川老腔影戏 */
  troupe: string;
  category: string;
  summary: string;
  /** 录音文件名（public/samples 下真实存在的 WAV） */
  audioFile?: string;
  script: ScriptLine[];
  perf: PerfPlan;
  /** 内置示例还是用户导入 */
  builtin?: boolean;
}

/* ---------------- 对齐结果 ---------------- */

export type CharStatus = 'matched' | 'extra' | 'missing';

export interface AlignedChar {
  id: string;
  ch: string;
  start: number;
  end: number;
  status: CharStatus;
  /** 对应唱本中的行 */
  lineId?: string;
  /** 对应唱本行内“可发音字符”的序号 */
  charIndex?: number;
  /** 拖腔时长（end-start）超过 3 秒时为 true */
  longDrag?: boolean;
}

export interface Cue {
  id: string;
  /** 对应唱本行；纯临场加句时为 null */
  lineId: string | null;
  kind: VocalKind;
  role?: string;
  /** 字幕显示区间（可在波形上拖动） */
  start: number;
  end: number;
  chars: AlignedChar[];
  mandarin: string;
  /** 用户手改的方言文本；为空则由 chars/唱本派生 */
  dialectText?: string;
  /** 整句均为临场新增 */
  improvised?: boolean;
}

export interface GapRegion {
  id: string;
  start: number;
  end: number;
  type: GapType;
  label: string;
}

export interface AlignStats {
  scriptLines: number;
  sungLines: number;
  scriptChars: number;
  detectedSegments: number;
  matchedChars: number;
  extraChars: number;
  missingLines: number;
  gaps: number;
  durationSec: number;
  engineMs: number;
}

export interface AlignmentResult {
  cue: Cue[];
  gaps: GapRegion[];
  duration: number;
  stats: AlignStats;
  /** 对齐引擎版本 */
  engine: string;
  alignedAt: number;
}

export interface AlignOptions {
  /** 检测灵敏度 0..1，越高越能检出弱音 */
  sensitivity: number;
  /** 判定“句间停顿”的秒数 */
  lineGap: number;
}

export const LONG_DRAG_SECONDS = 3;
