import type { Cue, TimeChar } from '../../types';
import { set, store, subscribe, persistSoon, toast } from '../../state/store';
import { h, timeInput } from '../dom';
import { player } from '../../audio/player';
import { ensureAudioReady } from '../../audio/sampleLoader';
import { createWaveform, type WaveformHandle } from '../components/waveform';
import { lineRenderItems, composeDialect, type RenderItem } from '../../subtitles/render';
import { wrapLine, toUiTime, clamp } from '../../lib/text';
import { ICONS } from '../icons';

export function renderEditor(root: HTMLElement): (() => void) | void {
  if (!store.result || !store.cues.length || !ensureAudioReady()) {
    root.append(emptyState());
    return;
  }

  let wave: WaveformHandle | null = null;
  let listEl: HTMLElement;
  let timeLabel: HTMLElement;
  let playBtn: HTMLButtonElement;
  let lastActiveCue: string | null = null;

  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, '字幕编辑'),
        h('p', { class: 'page-desc' },
          '在波形上拖动字幕块左右边界即可微调；黄底为唱本有、录音未唱的句子，灰斜体为临场衬字，「拖」标记表示该字拖腔超过阈值。空格播放/暂停，←/→ 快退快进 2 秒。'),
      ),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => set({ route: 'export' }) }, '去导出 →'),
    ),
  );

  /* 设置条 */
  const maxCharsVal = h('b', null, String(store.options.maxCharsPerLine));
  const range = h('input', {
    type: 'range', min: '8', max: '24', step: '1', value: String(store.options.maxCharsPerLine),
    onInput: (e: Event) => {
      store.options.maxCharsPerLine = parseInt((e.target as HTMLInputElement).value, 10);
      maxCharsVal.textContent = String(store.options.maxCharsPerLine);
      persistSoon();
      renderList();
    },
  }) as HTMLInputElement;
  const mandarinSwitch = h('input', {
    type: 'checkbox',
    checked: store.options.showMandarin,
    onChange: (e: Event) => {
      store.options.showMandarin = (e.target as HTMLInputElement).checked;
      persistSoon();
      renderList();
    },
  }) as HTMLInputElement;
  const holdVal = h('b', null, `${store.options.longToneThreshold.toFixed(0)}s`);
  const holdRange = h('input', {
    type: 'range', min: '2', max: '6', step: '0.5', value: String(store.options.longToneThreshold),
    onInput: (e: Event) => {
      store.options.longToneThreshold = parseFloat((e.target as HTMLInputElement).value);
      holdVal.textContent = `${store.options.longToneThreshold.toFixed(1)}s`;
      // 即时按新阈值刷新拖腔标记；若长腔尾部超出 cue 结束则延长，保证字幕不提前消失
      const th = store.options.longToneThreshold;
      for (const c of store.result?.chars ?? []) c.longTone = !c.adlib && c.end - c.start >= th;
      for (const cue of store.cues) {
        const cs = cue.charIds
          .map((id) => store.result?.chars.find((c) => c.id === id))
          .filter(Boolean) as TimeChar[];
        cue.longTone = cs.some((c) => c.longTone);
        for (const lc of cs.filter((c) => c.longTone)) {
          const need = lc.end + store.options.holdTail;
          if (need > cue.end) cue.end = Math.round(need * 1000) / 1000;
        }
      }
      persistSoon();
      renderList();
      wave?.redraw();
    },
  }) as HTMLInputElement;

  root.append(
    h('div', { class: 'card settings-bar' },
      h('span', { class: 'setting' }, '每行不超过', range, maxCharsVal, '字'),
      h('span', { class: 'setting' }, '拖腔阈值', holdRange, holdVal),
      h('label', { class: 'setting', style: { cursor: 'pointer' } },
        h('span', { class: 'switch' }, mandarinSwitch, h('span', { class: 'track' })),
        '显示普通话行'),
      h('span', { class: 'muted', style: { fontSize: '12.5px' } }, '设置即时作用于断行与导出'),
    ),
  );

  /* 走带条 */
  playBtn = h('button', { class: 'play-btn', type: 'button', title: '播放/暂停（空格）', html: ICONS.play }) as HTMLButtonElement;
  playBtn.addEventListener('click', () => {
    if (player.playing) player.pause();
    else player.play();
  });
  timeLabel = h('div', { class: 'time-readout' },
    h('span', { class: 'cur' }, '00:00.0'),
    h('span', { class: 'dur' }, ` / ${toUiTime(player.duration())}`),
  );
  const curLabel = timeLabel.querySelector('.cur') as HTMLElement;

  root.append(
    h('div', { class: 'card wave-card', style: { padding: '12px 14px' } },
      h('div', { class: 'transport', style: { marginBottom: '10px' } },
        playBtn,
        timeLabel,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => wave?.zoomBy(1.35) }, '放大'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => wave?.zoomBy(1 / 1.35) }, '缩小'),
        h('span', { class: 'wave-hint' }, '拖左右边缘调边界 · 点击定位 · 边缘自动吸附音节'),
        h('div', { class: 'legend' },
          h('span', null, h('i', { style: { background: 'rgba(178,58,44,.8)' } }), '唱腔'),
          h('span', null, h('i', { style: { background: 'rgba(47,125,99,.8)' } }), '道白'),
          h('span', null, h('i', { style: { background: '#d99a16' } }), '漏唱句'),
          h('span', null, h('i', { style: { background: 'rgba(214,164,66,.4)' } }), '锣鼓/器乐'),
        ),
      ),
    ),
  );
  const waveCard = root.lastElementChild as HTMLElement;
  wave = createWaveform({
    cues: () => store.cues,
    result: () => store.result,
    selectedId: () => store.selectedCueId,
    onSelect: (id) => set({ selectedCueId: id }),
    onBoundaryChange: (id, s, e, commit) => {
      const cue = store.cues.find((c) => c.id === id);
      if (!cue) return;
      cue.start = Math.round(s * 1000) / 1000;
      cue.end = Math.round(e * 1000) / 1000;
      cue.manualTiming = true;
      updateCardTimeFields(cue);
      if (commit) {
        persistSoon();
        set({ cues: [...store.cues] });
      }
    },
  });
  waveCard.append(wave.el);
  (window as unknown as { __wave?: WaveformHandle }).__wave = wave;

  /* 主体：cue 列表 + 侧栏 */
  listEl = h('div', { class: 'cue-list' });
  const side = h('div', { class: 'side-panel' }, legendCard(), statsCard());
  root.append(h('div', { class: 'grid-editor mt-18' }, listEl, side));

  renderList();

  const unsubStore = subscribe(() => {
    renderList();
    wave?.redraw();
  });
  const unsubState = player.onStateChange((playing) => {
    playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
  });
  const unsubTick = player.onTick((t) => {
    curLabel.textContent = toUiTime(t);
    highlightActiveCue(t);
  });

  function highlightActiveCue(t: number) {
    const active = store.cues.find((c) => t >= c.start && t <= c.end && c.exportEnabled !== false);
    const id = active?.id ?? null;
    if (id === lastActiveCue) return;
    lastActiveCue = id;
    const cards = listEl.querySelectorAll<HTMLElement>('.cue-card');
    cards.forEach((card) => card.classList.toggle('active', card.dataset.cueId === id));
    if (id) {
      const el = listEl.querySelector<HTMLElement>(`[data-cue-id="${id}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 170 || r.bottom > window.innerHeight - 40) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
  }

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (player.playing) player.pause();
      else player.play();
    } else if (e.key === 'ArrowLeft') player.seek(player.getTime() - 2);
    else if (e.key === 'ArrowRight') player.seek(player.getTime() + 2);
  }
  document.addEventListener('keydown', onKey);

  return () => {
    unsubStore();
    unsubState();
    unsubTick();
    document.removeEventListener('keydown', onKey);
    wave?.destroy();
    player.pause();
  };

  /* ---------------- cue 卡片列表 ---------------- */
  function renderList() {
    listEl.replaceChildren();
    const charMap = new Map<string, TimeChar>();
    store.result?.chars.forEach((c) => charMap.set(c.id, c));
    const scriptMap = new Map(store.script.map((l) => [l.id, l]));

    store.cues.forEach((cue, idx) => {
      const line = cue.lineId ? scriptMap.get(cue.lineId) : undefined;
      const lineChars = cue.charIds.map((id) => charMap.get(id)).filter(Boolean) as TimeChar[];
      const items: RenderItem[] = line ? lineRenderItems(line, lineChars) : [];

      const dialectEl = h('div', { class: 'cue-dialect' });
      if (cue.textEdited || !items.length) {
        dialectEl.textContent = cue.dialect;
      } else {
        for (const row of chunkItems(items, store.options.maxCharsPerLine)) {
          const rowEl = h('div', { class: 'dialect-row' });
          for (const item of row) {
            if (item.kind === 'punct') {
              rowEl.append(h('span', { class: 'tok tok-punct' }, item.text));
            } else {
              rowEl.append(renderToken(item.ch, cue, () => {
                recomposeCue(cue, line, lineChars);
                wave?.redraw();
                set({ cues: [...store.cues] });
              }));
            }
          }
          dialectEl.append(rowEl);
        }
      }

      const mandarinArea = h('textarea', {
        rows: '1',
        placeholder: '普通话释义…',
        onInput: (e: Event) => {
          cue.mandarin = (e.target as HTMLTextAreaElement).value;
          persistSoon();
        },
      }) as HTMLTextAreaElement;
      mandarinArea.value = cue.mandarin;

      const startInput = timeInput(cue.start, (v) => {
        cue.start = clamp(Math.min(v, cue.end - 0.2), 0, player.duration());
        cue.manualTiming = true;
        persistSoon();
        set({ cues: [...store.cues] });
      });
      startInput.classList.add('start-input');
      const endInput = timeInput(cue.end, (v) => {
        cue.end = clamp(Math.max(v, cue.start + 0.2), 0.2, player.duration());
        cue.manualTiming = true;
        persistSoon();
        set({ cues: [...store.cues] });
      });
      endInput.classList.add('end-input');

      const durLabel = h('span', { class: 'cue-time-duration' }, `${(cue.end - cue.start).toFixed(2)}s`);

      const card = h('div', {
        class: `cue-card kind-${cue.kind}${cue.missingLine ? ' missing' : ''}${store.selectedCueId === cue.id ? ' active' : ''}`,
        'data-cue-id': cue.id,
        onclick: (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('input,textarea,button,.tok-adlib')) return;
          set({ selectedCueId: cue.id });
        },
      },
        h('div', { class: 'cue-head' },
          h('span', { class: 'cue-index' }, `#${idx + 1}`),
          h('span', { class: `badge ${cue.kind === 'sing' ? 'badge-sing' : 'badge-speak'}` }, cue.kind === 'sing' ? '唱腔' : '道白'),
          cue.missingLine ? h('span', { class: 'badge badge-warn' }, '⚠ 唱本有·未听到') : null,
          cue.longTone ? h('span', { class: 'badge badge-indigo' }, '含拖腔≥阈值') : null,
          cue.manualTiming ? h('span', { class: 'badge badge-gold' }, '已微调') : null,
          startInput,
          h('span', { class: 'time-arrow' }, '→'),
          endInput,
          durLabel,
          h('div', { class: 'cue-actions' },
            h('button', {
              class: 'icon-btn', type: 'button', title: '试听本句',
              onclick: (e: Event) => {
                e.stopPropagation();
                player.play([cue.start - 0.05, cue.end + 0.12]);
              },
            }, '▶ 试听'),
            cue.missingLine
              ? h('label', { class: 'setting', style: { fontSize: '12.5px' }, title: '勾选后该黄句也写入导出字幕' },
                  h('input', {
                    type: 'checkbox',
                    checked: cue.exportEnabled,
                    onChange: (e: Event) => {
                      cue.exportEnabled = (e.target as HTMLInputElement).checked;
                      persistSoon();
                      toast(cue.exportEnabled ? '该句将参与导出' : '该句已从导出中排除');
                    },
                  }), '导出此句')
              : null,
          ),
        ),
      );

      if (cue.missingLine) {
        card.append(
          h('div', { class: 'missing-banner' },
            h('span', { html: ICONS.warn }),
            h('span', null, '这一句在唱本里，但录音中没有听到演唱（可能被艺人漏掉）。已用前后句时间估算位置并标黄，默认不导出；可拖动边界定位后勾选“导出此句”。'),
          ),
        );
      }

      card.append(dialectEl);
      if (store.options.showMandarin) {
        card.append(h('div', { class: 'cue-mandarin' }, mandarinArea));
      }

      /* 逐字时间 */
      const details = h('details', { class: 'char-times-wrap' });
      const summary = h('summary', { class: 'muted', style: { fontSize: '12.5px', cursor: 'pointer' } },
        `逐字起止时间（${lineChars.length}）`);
      details.append(summary);
      const chips = h('div', { class: 'char-times' });
      for (const c of lineChars) {
        chips.append(charChip(c, cue, wave));
      }
      details.append(chips);
      card.append(details);

      listEl.append(card);
    });
  }

  function updateCardTimeFields(cue: Cue) {
    const card = listEl.querySelector<HTMLElement>(`[data-cue-id="${cue.id}"]`);
    if (!card) return;
    const s = card.querySelector<HTMLInputElement>('.start-input');
    const e = card.querySelector<HTMLInputElement>('.end-input');
    if (s && document.activeElement !== s) s.value = cue.start.toFixed(2);
    if (e && document.activeElement !== e) e.value = cue.end.toFixed(2);
    const d = card.querySelector('.cue-time-duration');
    if (d) d.textContent = `${(cue.end - cue.start).toFixed(2)}s`;
  }
}

/* ----------------  token / chip 组件 ---------------- */

function renderToken(c: TimeChar, cue: Cue, onEdited: () => void): HTMLElement {
  const cls = ['tok'];
  if (c.adlib) cls.push('tok-adlib');
  if (c.missing) cls.push('tok-missing');
  if (c.longTone) cls.push('tok-long');
  const span = h('span', {
    class: cls.join(' '),
    title: c.adlib
      ? `临场衬字 ${c.start.toFixed(2)}-${c.end.toFixed(2)}s，双击改字`
      : c.missing
        ? '唱本有此字但未对齐到声音'
        : `${c.start.toFixed(2)}-${c.end.toFixed(2)}s`,
    ondblclick: (e: MouseEvent) => {
      if (!c.adlib) return;
      e.stopPropagation();
      const input = h('input', { class: 'adlib-edit', value: c.ch, maxlength: '3' }) as HTMLInputElement;
      span.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const v = input.value.trim();
        if (v) c.ch = v;
        persistSoon();
        onEdited();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        ev.stopPropagation();
      });
    },
  }, c.ch);
  span.addEventListener('click', (e) => {
    e.stopPropagation();
    player.play([c.start, c.end + 0.15]);
  });
  return span;
}

function charChip(c: TimeChar, cue: Cue, wave: WaveformHandle | null): HTMLElement {
  const sIn = h('input', {
    type: 'number', step: '0.01', value: c.start.toFixed(2),
    title: '开始秒',
    onChange: (e: Event) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (!Number.isFinite(v)) return;
      c.start = v;
      if (c.start < cue.start) cue.start = Math.max(0, c.start - 0.1);
      persistSoon();
      wave?.redraw();
    },
  }) as HTMLInputElement;
  const eIn = h('input', {
    type: 'number', step: '0.01', value: c.end.toFixed(2),
    title: '结束秒',
    onChange: (ev: Event) => {
      const v = parseFloat((ev.target as HTMLInputElement).value);
      if (!Number.isFinite(v)) return;
      c.end = v;
      if (c.end > cue.end) cue.end = c.end + 0.1;
      persistSoon();
      wave?.redraw();
    },
  }) as HTMLInputElement;
  return h('span', {
    class: `char-chip${c.adlib ? ' adlib' : ''}${c.missing ? ' missing' : ''}`,
  },
    h('b', { title: '点击试听该字', style: { cursor: 'pointer' }, onclick: () => player.play([c.start, c.end + 0.12]) }, c.ch),
    sIn, h('span', { class: 'muted' }, '–'), eIn,
    c.longTone ? h('span', { class: 'badge badge-indigo', style: { fontSize: '10.5px' } }, `${(c.end - c.start).toFixed(1)}s`) : null,
  );
}

/* ---------------- 辅助 ---------------- */

function chunkItems(items: RenderItem[], maxChars: number): RenderItem[][] {
  const rows: RenderItem[][] = [];
  let row: RenderItem[] = [];
  let count = 0;
  const flush = () => {
    if (row.length) rows.push(row);
    row = [];
    count = 0;
  };
  for (const item of items) {
    row.push(item);
    if (item.kind === 'char') count++;
    const isPunct = item.kind === 'punct' && /[，。、；：？！,…—]/.test(item.text);
    if (isPunct && count >= Math.ceil(maxChars * 0.5)) flush();
    else if (count >= maxChars) flush();
  }
  flush();
  return rows;
}

function recomposeCue(cue: Cue, _line: { dialect: string } | undefined, lineChars: TimeChar[]) {
  const fullLine = store.script.find((l) => l.id === cue.lineId);
  if (fullLine) cue.dialect = composeDialect(fullLine, lineChars);
  persistSoon();
}

function legendCard(): HTMLElement {
  return h('div', { class: 'card legend-card' },
    h('h3', null, '图例与规则'),
    legendRow('var(--warn-bg)', '黄色卡片：唱本里有、但录音中没唱的整句，默认不导出。'),
    legendRow('var(--gray-bg)', '灰色斜体字：对齐识别出的临场衬字，双击可改成实际字音。'),
    legendRow('var(--indigo-soft)', '「拖」标：该字拖腔达到设定阈值，字幕结束时间已覆盖整个长腔。'),
    legendRow('rgba(214,164,66,.35)', '锣鼓/器乐过门：自动作为间隙，字幕不会压在过门段上。'),
  );
}
function legendRow(bg: string, text: string): HTMLElement {
  return h('div', { class: 'legend-row' }, h('span', { class: 'swatch', style: { background: bg } }), h('span', null, text));
}

function statsCard(): HTMLElement {
  const s = store.result?.stats;
  return h('div', { class: 'card' },
    h('h3', null, '对齐概况'),
    s
      ? h('div', { style: { fontSize: '13.5px', color: 'var(--ink-2)', display: 'grid', gap: '5px' } },
          h('div', null, `检测音节段：${s.detectedSegments}（人声 ${s.vocalSegments}）`),
          h('div', null, `聚成乐句：${s.phraseCount} · 命中句：${s.matchedLines}`),
          h('div', null, `漏唱句：${s.missingLines} · 衬字：${s.adlibCount} · 拖腔字：${s.longToneCount}`),
          h('div', null, `对齐计算耗时：${s.elapsedMs.toFixed(0)} ms`),
        )
      : h('p', { class: 'muted' }, '暂无对齐数据。'),
    h('button', { class: 'btn btn-ghost btn-sm mt-12', type: 'button', onclick: () => set({ route: 'align' }) }, '查看性能基准 / 重新对齐'),
  );
}

function emptyState(): HTMLElement {
  return h('div', { class: 'card empty-state' },
    h('div', { class: 'es-icon', html: ICONS.worker }),
    h('h2', null, '还没有对齐结果'),
    h('p', null, '请先导入唱本与录音，并在“录音对齐”页运行自动对齐。'),
    h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => set({ route: 'import' }) }, '去导入唱本'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => set({ route: 'align' }) }, '去对齐'),
    ),
  );
}
