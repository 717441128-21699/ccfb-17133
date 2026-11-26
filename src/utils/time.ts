/** 秒 -> SRT 时间码 00:00:01,200 */
export function toSRTTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec0 = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const carry = ms === 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(sec0 + (carry ? 1 : 0), 2)},${carry ? '000' : pad(ms, 3)}`;
}

/** 秒 -> VTT 时间码 00:00:01.200 */
export function toVTTTime(sec: number): string {
  return toSRTTime(sec).replace(',', '.');
}

/** 秒 -> ASS 时间码 0:00:01.20 (厘秒) */
export function toASSTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec0 = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  const carry = cs === 100;
  return `${h}:${pad(m, 2)}:${pad(sec0 + (carry ? 1 : 0), 2)}.${carry ? '00' : pad(cs, 2)}`;
}

/** 秒 -> 编辑器显示 mm:ss.mmm */
export function toEditTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${pad(m, 2)}:${r.toFixed(2).padStart(5, '0')}`;
}

/** 紧凑时长 1:23 */
export function toClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${pad(r, 2)}`;
}

export function parseTimeInput(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (m) {
    const h = m[1] ? parseInt(m[1], 10) : 0;
    return h * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
  }
  return null;
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}
