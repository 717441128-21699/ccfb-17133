// 文本与时间工具

/** 取字符串中的汉字/有效字符（保留中文标点位置由调用方决定） */
export function charsOf(text: string): string[] {
  return Array.from(text).filter((c) => c.trim().length > 0);
}

/** 只保留汉字与字母数字（用于对齐 token） */
export function alignTokens(text: string): string[] {
  return Array.from(text).filter((c) => /[一-鿿A-Za-z0-9]/.test(c));
}

/**
 * 按最大字数给方言句断行。
 * 优先在标点（，。、；：？！）后断，其次贪心断行。
 * 标点计入上一行但不计入字数压力（按全角宽度 1 计）。
 */
export function wrapLine(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, '');
  if (Array.from(clean).length <= maxChars) return [clean];
  const out: string[] = [];
  let cur = '';
  let count = 0;
  const flush = () => {
    if (cur) out.push(cur);
    cur = '';
    count = 0;
  };
  for (const ch of clean) {
    cur += ch;
    // 标点后优先断行
    if (/[，。、；：？！,…—]/.test(ch) && count + 1 >= Math.ceil(maxChars * 0.5)) {
      flush();
      continue;
    }
    count += /[，。、；：？！,…—]/.test(ch) ? 0 : 1;
    if (count >= maxChars) flush();
  }
  flush();
  return out;
}

/** 把整段唱本按换行/句号切成句（导入解析用） */
export function splitScriptText(raw: string): { kind: 'sing' | 'speak'; dialect: string; mandarin: string }[] {
  const lines: { kind: 'sing' | 'speak'; dialect: string; mandarin: string }[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    let kind: 'sing' | 'speak' = 'sing';
    const tag = line.match(/^\s*[\[【]?\s*(唱|唱腔|道白|白|念)\s*[\]】]?\s*[:：]?\s*/);
    if (tag) {
      kind = tag[1] === '白' || tag[1] === '道白' || tag[1] === '念' ? 'speak' : 'sing';
      line = line.slice(tag[0].length);
    }
    // 方言 || 普通话 或 | 分隔
    let dialect = line;
    let mandarin = '';
    const sep = line.split(/\s*\|\|\s*|\s*｜｜\s*|\s*\t\s*/);
    if (sep.length === 2) {
      dialect = sep[0].trim();
      mandarin = sep[1].trim();
    }
    lines.push({ kind, dialect, mandarin });
  }
  return lines;
}

/* ---------------- 时间码 ---------------- */

export function pad(n: number, len = 2): string {
  return String(Math.floor(n)).padStart(len, '0');
}

/** SRT: HH:MM:SS,mmm（先整体四舍五入到毫秒，避免 999.6ms 进位出 60 秒） */
export function toSrtTime(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** VTT: HH:MM:SS.mmm */
export function toVttTime(sec: number): string {
  return toSrtTime(sec).replace(',', '.');
}

/** ASS: H:MM:SS.cc */
export function toAssTime(sec: number): string {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec - Math.floor(sec)) * 100);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs === 100 ? 0 : cs)}`;
}

/** 界面显示 mm:ss.d */
export function toUiTime(sec: number): string {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const d = Math.floor((sec - Math.floor(sec)) * 10);
  return `${pad(m)}:${pad(s)}.${d}`;
}

let idCounter = 0;
export function uid(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
