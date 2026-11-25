import { set, store, toast, subscribe } from '../../state/store';
import { h } from '../dom';
import { ICONS } from '../icons';
import { ensureAudioReady } from '../../audio/sampleLoader';
import { player } from '../../audio/player';
import { runAlignment, runBenchmark } from '../../align/runner';
import type { BenchReport } from '../../types';

export function renderAlign(root: HTMLElement): (() => void) | void {
  if (!store.script.length || !ensureAudioReady()) {
    root.append(emptyState());
    return;
  }

  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, '录音对齐'),
        h('p', { class: 'page-desc' },
          `对齐计算全部运行在 Web Worker 中，不阻塞界面。当前唱本 ${store.script.length} 句，录音「${store.audioName}」时长 ${player.duration().toFixed(1)}s。引擎：能量 VAD + YIN 基频 + 两级模糊序列对齐，对漏句与衬字做局部 gap，不会整段错位。`),
      ),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => set({ route: 'import' }) }, '← 返回导入'),
    ),
  );

  const body = h('div');
  root.append(body);
  paint(body);

  // 进度 / 状态变化时重绘本页主体
  const unsub = subscribe(() => paint(body));
  return () => unsub();
}

function paint(root: HTMLElement) {
  root.replaceChildren();

  if (store.alignStatus === 'working') {
    root.append(progressCard());
    return;
  }

  if (store.alignStatus === 'done' && store.result) {
    root.append(resultView());
    return;
  }

  // idle / error 英雄区
  const card = h('div', { class: 'card align-hero' },
    h('div', { class: 'big-icon', html: ICONS.worker }),
    h('h2', null, store.alignStatus === 'error' ? '对齐失败' : '准备就绪，开始自动对齐'),
    h('p', null, store.alignStatus === 'error'
      ? store.alignError
      : 'Worker 将分析波形能量、检测音节与锣鼓段、把唱本逐句逐字对齐到时间轴，并自动套用拖腔保持与过门避让规则。'),
    store.alignStatus === 'error'
      ? h('pre', { class: 'ffmpeg-cmd', style: { textAlign: 'left', whiteSpace: 'pre-wrap', marginBottom: '16px' } }, store.alignError)
      : null,
    h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: startAlignment }, '⚡ 开始自动对齐'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: startBench }, '⏱ 两小时规模性能自测'),
    ),
    store.bench ? benchCard(store.bench) : null,
  );
  root.append(card);
}

function progressCard(): HTMLElement {
  const pct = Math.round(store.progressPct * 100);
  return h('div', { class: 'card align-hero' },
    h('div', { class: 'big-icon', html: ICONS.worker }),
    h('h2', null, 'Worker 正在对齐…'),
    h('div', { class: 'progress-track', style: { marginTop: '18px' } },
      h('div', { class: 'progress-fill', style: { width: `${pct}%` } })),
    h('div', { class: 'progress-msg' }, `${pct}% · ${store.progressMsg}`),
  );
}

function resultView(): HTMLElement {
  const r = store.result!;
  const s = r.stats;
  const missing = r.lines.filter((l) => !l.matched);
  const adlibs = r.chars.filter((c) => c.adlib);
  const longTones = r.chars.filter((c) => c.longTone);

  const wrap = h('div');
  wrap.append(
    h('div', { class: 'card' },
      h('div', { class: 'btn-row' },
        h('h2', { style: { fontSize: '21px', flex: '1' } }, '✅ 对齐完成'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: startAlignment }, '重新对齐'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => set({ route: 'edit' }) }, '进入字幕编辑 →'),
      ),
      h('div', { class: 'stats-grid' },
        stat(s.audioSeconds.toFixed(1) + 's', '录音时长'),
        stat(`${s.elapsedMs.toFixed(0)}ms`, '对齐计算耗时'),
        stat(String(s.detectedSegments), `检测声音段 / ${s.phraseCount} 乐句`),
        stat(`${s.matchedLines}/${store.script.length}`, '命中句数'),
        stat(String(s.missingLines), '标黄漏唱句'),
        stat(String(s.adlibCount), '灰字衬字'),
        stat(String(s.longToneCount), '拖腔≥3s 字'),
        stat(String(r.interludes.length), '锣鼓/器乐过门'),
      ),
    ),
  );

  const findings = h('div', { class: 'findings mt-18' });

  findings.append(findingCard('warn', `⚠ 标黄：艺人没唱的句子（${missing.length}）`,
    missing.length
      ? h('ul', null, missing.map((l) => {
          const line = store.script.find((x) => x.id === l.lineId);
          return h('li', null, line ? `「${line.dialect}」` : l.lineId);
        }))
      : h('p', { class: 'muted' }, '本出没有漏句。')));

  findings.append(findingCard('gray', `🩶 灰字：临场加的衬字（${adlibs.length}）`,
    adlibs.length
      ? h('ul', null, adlibs.map((c) => {
          const line = store.script.find((x) => x.id === c.lineId);
          return h('li', null, `「${c.ch}」${line ? ` · ${line.dialect.slice(0, 12)}…` : ''} · ${c.start.toFixed(1)}s`);
        }))
      : h('p', { class: 'muted' }, '未检测到额外衬字。')));

  findings.append(findingCard('indigo', `🌊 拖腔长字（${longTones.length}）`,
    longTones.length
      ? h('ul', null, longTones.map((c) =>
          h('li', null, `「${c.ch}」拖腔 ${(c.end - c.start).toFixed(1)}s，字幕已延长覆盖`)))
      : h('p', { class: 'muted' }, '没有超过阈值的长拖腔。')));

  findings.append(findingCard('jade', `🥁 锣鼓过门 / 纯器乐（${r.interludes.length}）`,
    r.interludes.length
      ? h('ul', null, r.interludes.map((it) =>
          h('li', null, `${it.label} ${it.start.toFixed(1)}–${it.end.toFixed(1)}s（此区间无字幕）`)))
      : h('p', { class: 'muted' }, '未检测到明显过门。')));

  wrap.append(findings);

  wrap.append(
    h('div', { class: 'card mt-18' },
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-gold', type: 'button', onclick: startBench }, '⏱ 运行两小时规模性能自测'),
        store.bench ? h('span', { class: 'badge badge-gold' }, store.bench.note) : h('span', { class: 'muted', style: { fontSize: '13px' } }, '在 Worker 中对 1000 句 / 1.4 万字 / 2.4 万音节段跑完整 DP'),
      ),
      store.bench ? benchCard(store.bench) : null,
    ),
  );

  return wrap;
}

function stat(num: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, num), h('div', { class: 'stat-label' }, label));
}

function findingCard(cls: 'warn' | 'gray' | 'gold' | 'jade' | 'indigo', title: string, content: HTMLElement): HTMLElement {
  return h('div', { class: `finding ${cls === 'indigo' ? 'gold' : cls}` }, h('h4', null, title), content);
}

function benchCard(b: BenchReport): HTMLElement {
  return h('div', { class: 'mt-12' },
    h('div', { class: 'stats-grid', style: { margin: '8px 0' } },
      stat(b.lineCount.toLocaleString(), '模拟句数'),
      stat(b.scriptChars.toLocaleString(), '唱字规模'),
      stat(b.segmentCount.toLocaleString(), '音节段'),
      stat(`${(b.elapsedMs / 1000).toFixed(1)}s`, 'DP 实测'),
    ),
    h('p', { style: { fontSize: '13.5px', color: 'var(--ink-2)' } }, b.note),
  );
}

function emptyState(): HTMLElement {
  return h('div', { class: 'card empty-state' },
    h('h2', null, '缺少唱本或录音'),
    h('p', null, '请先选择示例戏（会自动合成录音），或导入你自己的材料。'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => set({ route: 'import' }) }, '去导入唱本'),
  );
}

export async function startAlignment() {
  if (!ensureAudioReady() || !player.buffer) {
    toast('音频尚未就绪', 'err');
    return;
  }
  const mono = player.getMonoPcm();
  if (!mono) return;
  set({ alignStatus: 'working', progressPct: 0.05, progressMsg: '正在把音频送入 Worker…', alignError: '' });
  // 让进度卡片先渲染
  await new Promise((r) => setTimeout(r, 30));
  try {
    const { result, cues } = await runAlignment({
      pcm: mono.pcm,
      sampleRate: mono.sampleRate,
      duration: mono.duration,
      script: store.script,
      options: store.options,
      onProgress: (pct, message) => set({ progressPct: pct, progressMsg: message }),
    });
    set({
      result,
      cues,
      alignStatus: 'done',
      progressPct: 1,
      audioDuration: result.duration,
      selectedCueId: cues[0]?.id ?? null,
    });
    toast('对齐完成', 'ok');
  } catch (e) {
    console.error(e);
    set({ alignStatus: 'error', alignError: (e as Error).message ?? String(e) });
    toast('对齐失败', 'err');
  }
}

async function startBench() {
  set({ benchRunning: true });
  toast('Worker 正在跑两小时规模基准…');
  try {
    const report = await runBenchmark();
    set({ bench: report, benchRunning: false });
    toast(`基准完成：DP ${report.elapsedMs}ms`, 'ok');
    // store 订阅会自动重绘本页并展示 benchCard
  } catch (e) {
    set({ benchRunning: false });
    toast(`基准失败：${(e as Error).message}`, 'err');
  }
}
