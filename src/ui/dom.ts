// 极简 hyperscript 辅助
export type ElChild = Node | string | number | false | null | undefined | ElChild[];

export interface ElProps {
  class?: string;
  id?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean | undefined | null>;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  on?: Record<string, EventListenerOrEventListenerObject>;
  value?: string | number;
  checked?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps | null,
  ...children: ElChild[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === 'class') el.className = String(val);
      else if (key === 'html') el.innerHTML = String(val);
      else if (key === 'text') el.textContent = String(val);
      else if (key === 'value') (el as HTMLInputElement).value = String(val);
      else if (key === 'checked') (el as HTMLInputElement).checked = Boolean(val);
      else if (key === 'disabled') (el as HTMLInputElement).disabled = Boolean(val);
      else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val);
      } else if (key === 'on' && val && typeof val === 'object') {
        for (const [ev, fn] of Object.entries(val as Record<string, EventListener>)) {
          el.addEventListener(ev, fn);
        }
      } else if (key === 'attrs' && val && typeof val === 'object') {
        for (const [a, v] of Object.entries(val as Record<string, string | number | boolean | undefined | null>)) {
          if (v == null || v === false) continue;
          el.setAttribute(a, String(v));
        }
      } else if (key.startsWith('data-') || key === 'role' || key === 'title' || key === 'for') {
        el.setAttribute(key, String(val));
      } else if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
      } else {
        try {
          (el as unknown as Record<string, unknown>)[key] = val;
        } catch {
          el.setAttribute(key, String(val));
        }
      }
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el: HTMLElement, children: ElChild[]) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

/** 数字时间输入框（秒） */
export function timeInput(value: number, onCommit: (v: number) => void, step = 0.05): HTMLInputElement {
  const input = h('input', {
    class: 'time-input',
    type: 'number',
    step: String(step),
    min: '0',
    value: value.toFixed(2),
  }) as HTMLInputElement;
  const commit = () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && v >= 0) onCommit(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      input.blur();
    }
  });
  return input;
}
