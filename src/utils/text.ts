import type { ScriptLine, VocalKind } from '../types/domain';

/** 统计“字”数：CJK 汉字 / 假名 / 字母数字都按一个字计，标点空格不计 */
export function countChars(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (/[一-鿿㐀-䶿豈-﫿]/.test(ch)) n++;
    else if (/[a-zA-Z0-9]/.test(ch)) n++;
  }
  return n;
}

/** 取出所有可发音字符（与 countChars 口径一致） */
export function spokenChars(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    if (/[一-鿿㐀-䶿豈-﫿a-zA-Z0-9]/.test(ch)) out.push(ch);
  }
  return out;
}

const BREAK_PUNCT = '，。！？；：、,…,.!?;:）》」』】';

/**
 * 按每行最多 maxChars 个字自动断行。
 * 优先在标点/停顿处断；超长整句再硬切；标点挂在行尾，不单独成行。
 */
export function wrapLine(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (maxChars <= 0) return [clean];

  const result: string[] = [];
  let current = '';
  let currentCount = 0;

  const flush = () => {
    const t = current.trim();
    if (t) result.push(t);
    current = '';
    currentCount = 0;
  };

  for (const ch of clean) {
    const isSpoken = /[一-鿿㐀-䶿豈-﫿a-zA-Z0-9]/.test(ch);
    if (currentCount >= maxChars && (isSpoken || current.length > 0)) {
      // 若下一个字符是闭标点，让它挂到当前行尾
      if (BREAK_PUNCT.includes(ch) && '，。！？；：、,…,.!?;:'.includes(ch) === false) {
        current += ch;
        flush();
        continue;
      }
      flush();
    }
    current += ch;
    if (isSpoken) currentCount++;
    // 遇到句读且已超过上限的 60%，优先断行
    if ('，。！？；、,.!?;'.includes(ch) && currentCount >= Math.ceil(maxChars * 0.6)) {
      flush();
    }
  }
  flush();

  // 硬保险：任何仍然超长的行按 maxChars 硬切
  const final: string[] = [];
  for (const line of result) {
    if (countChars(line) <= maxChars + 1) {
      final.push(line);
      continue;
    }
    let buf = '';
    let n = 0;
    for (const ch of line) {
      const isSpoken = /[一-鿿㐀-䶿豈-﫿a-zA-Z0-9]/.test(ch);
      if (n >= maxChars && isSpoken) {
        final.push(buf);
        buf = '';
        n = 0;
      }
      buf += ch;
      if (isSpoken) n++;
    }
    if (buf.trim()) final.push(buf.trim());
  }
  return final.length ? final : [''];
}

let idSeq = 0;
export function nextId(prefix = 'id'): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

/**
 * 解析纯文本唱本。支持格式（每行一句）：
 *   [角色]（唱/白）方言唱词 || 普通话释义
 *   孙悟空（唱）：河东城刮大风…… || 河东城刮起大风……
 *   铁扇公主(白): 你这泼猴！ || 你这猴子！
 * 也兼容 “唱：…” / “白：…” 前缀。
 */
export function parseScriptText(raw: string): ScriptLine[] {
  const lines: ScriptLine[] = [];
  const rawLines = raw.split(/\r?\n/);
  for (const rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,6}\s*/.test(line)) continue; // markdown 标题
    if (/^\/\//.test(line)) continue;

    let kind: VocalKind = 'sing';
    let role: string | undefined;

    // [角色] / 【角色】
    const bracket = line.match(/^\s*[【\[]\s*([^】\]]{1,12})\s*[】\]]\s*/);
    if (bracket) {
      role = bracket[1].trim();
      line = line.slice(bracket[0].length);
    }

    // “角色（唱/白）: ……” 或 “（唱）……” —— 圆括号里的唱白标记
    const parenKind = line.match(
      /^(?:([一-鿿A-Za-z0-9·]{1,8}))?\s*[（(]\s*(唱腔?|唱段?|道白|念白|白口|白)\s*[)）]\s*[:：]?\s*/,
    );
    if (parenKind) {
      if (!role && parenKind[1]) role = parenKind[1].trim();
      kind = parenKind[2].includes('白') ? 'speak' : 'sing';
      line = line.slice(parenKind[0].length);
    } else {
      // （唱）/(白)/唱腔/道白 标记，可在开头
      const kindMatch = line.match(/^[（(]?\s*(唱腔?|唱段?|道白|念白|白口|白)\s*[)）]?\s*[:：]?\s*/);
      if (kindMatch) {
        const k = kindMatch[1];
        kind = k.includes('白') ? 'speak' : 'sing';
        line = line.slice(kindMatch[0].length);
      } else {
        const prefixKind = line.match(/^(唱|白)\s*[:：]\s*/);
        if (prefixKind) {
          kind = prefixKind[1] === '白' ? 'speak' : 'sing';
          line = line.slice(prefixKind[0].length);
        }
      }
    }

    // 角色：台词（无括号的 “孙悟空：…”）
    if (!role) {
      const roleMatch = line.match(/^([一-鿿A-Za-z0-9·]{1,8})\s*[:：]\s*/);
      if (roleMatch && !/^(唱|白)$/.test(roleMatch[1])) {
        role = roleMatch[1];
        line = line.slice(roleMatch[0].length);
      }
    }

    let mandarin = '';
    const sep = line.split(/\s*(?:\|\||｜｜|▶|=>|→)\s*/);
    let dialect = line;
    if (sep.length >= 2) {
      dialect = sep[0].trim();
      mandarin = sep.slice(1).join(' || ').trim();
    }

    if (!dialect) continue;
    lines.push({ id: nextId('line'), kind, role, dialect, mandarin });
  }
  return lines;
}

/** 导出用：把唱本行格式化为可再次导入的文本 */
export function serializeScript(lines: ScriptLine[]): string {
  return lines
    .map((l) => {
      const role = l.role ? `【${l.role}】` : '';
      const kind = l.kind === 'speak' ? '（白）' : '（唱）';
      const tr = l.mandarin ? ` || ${l.mandarin}` : '';
      return `${role}${kind}${l.dialect}${tr}`;
    })
    .join('\n');
}
