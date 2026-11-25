// 合成示例录音使用的「音高锚点码」。
// 真实方言唱段没有逐字绝对音高锚点；因为示例录音是我们自己用程序编出来的，
// 合成时给每个字一个由字形确定性映射到的十二平均律音高，
// Worker 端通过基频检测还原该码，从而让漏句 / 衬字 / 拖腔的模糊对齐稳定可复现。
// 对真实上传录音，pitchCode 为 -1，对齐退化为能量分段 + 时长/序列模糊匹配 + 人工微调。

export const PITCH_CLASSES = 12;

/** 字符串 -> 0..11 稳定编码 */
export function pitchCodeOf(ch: string): number {
  let h = 2166136261;
  for (let i = 0; i < ch.length; i++) {
    h ^= ch.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) % PITCH_CLASSES;
}

/** C4 起一个八度的十二平均律频率 */
export function codeToFreq(code: number): number {
  return 261.63 * Math.pow(2, code / 12);
}

/** 基频 -> 最近的锚点码（含八度容错，返回 -1 表示不可信） */
export function freqToPitchCode(f0: number, clarity: number): number {
  if (f0 <= 0 || clarity < 0.3) return -1;
  // 找到最接近的 C4..B4 及其相邻八度
  const midi = 69 + 12 * Math.log2(f0 / 440);
  const pc = Math.round(midi) % 12;
  const octave = Math.round(midi / 12 - 1); // midi 60 -> octave 4? rough guard below
  void octave;
  const midiRound = Math.round(midi);
  // 合成锚点集中在 midi 60..71，允许落到相邻八度 48..83
  if (midiRound < 48 || midiRound > 84) return -1;
  return ((pc % 12) + 12) % 12;
}

/**
 * 常见临场衬字的专用声学码表（演示用「微型字音模型」）。
 * 每个衬字占用一个唯一锚点码；合成时按此编码发声，
 * 对齐端在把未匹配音节判为衬字时反查该表得到候选字。
 */
export const PARTICLE_CODES: Record<string, number> = {
  哎: 0,
  呀: 1,
  啊: 2,
  哟: 3,
  嗨: 4,
  咦: 5,
  哦: 6,
  喏: 7,
};

export function codeToParticle(code: number): string | null {
  for (const [ch, c] of Object.entries(PARTICLE_CODES)) {
    if (c === code) return ch;
  }
  return null;
}

/** 音高检测有半音抖动时，按循环最近音级找衬字（容差 1 个半音） */
export function guessParticle(code: number): string {
  if (code < 0) return '衬';
  const exact = codeToParticle(code);
  if (exact) return exact;
  let best: string | null = null;
  let bestDist = 99;
  for (const [ch, c] of Object.entries(PARTICLE_CODES)) {
    let d = Math.abs(c - code);
    d = Math.min(d, 12 - d);
    if (d < bestDist) {
      bestDist = d;
      best = ch;
    }
  }
  return bestDist <= 1 && best ? best : '衬';
}
