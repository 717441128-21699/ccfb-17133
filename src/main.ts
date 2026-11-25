import './styles.css';
import { store, subscribe, set, resetProject, toast } from './state/store';
import { h } from './ui/dom';
import { PLAYS } from './data/plays';
import { loadSampleAudio, ensureAudioReady } from './audio/sampleLoader';
import { renderImport } from './ui/pages/import';
import { renderAlign, startAlignment } from './ui/pages/align';
import { renderEditor } from './ui/pages/editor';
import { renderExport } from './ui/pages/export';
import type { Route } from './state/store';

const STEPS: { id: Route; num: string; label: string }[] = [
  { id: 'import', num: '1', label: '唱本导入' },
  { id: 'align', num: '2', label: '录音对齐' },
  { id: 'edit', num: '3', label: '字幕编辑' },
  { id: 'export', num: '4', label: '导出' },
];

const app = document.getElementById('app')!;

/* ---------------- 顶栏 ---------------- */
const tabs: HTMLButtonElement[] = [];
const header = h('header', { class: 'app-header' },
  h('div', { class: 'header-inner' },
    h('div', { class: 'brand' },
      h('div', { class: 'brand-seal' }, '影'),
      h('div', null,
        h('div', { class: 'brand-title' }, '影戏字幕工坊'),
        h('div', { class: 'brand-sub' }, '皮影戏 · 方言唱本自动对齐 · 双语字幕'),
      ),
    ),
    h('nav', { class: 'stepper', 'aria-label': '主导航' },
      ...STEPS.map((s) => {
        const tab = h('button', {
          class: 'step-tab',
          type: 'button',
          onclick: () => {
            window.location.hash = `#/${s.id}`;
          },
        }, h('span', { class: 'step-num' }, s.num), s.label) as HTMLButtonElement;
        tabs.push(tab);
        return tab;
      }),
    ),
    h('button', {
      class: 'header-reset', type: 'button', title: '清空本地保存的工程并重新开始',
      onclick: () => {
        if (window.confirm('确定清空当前工程与本地保存的对齐结果吗？（不会删除示例剧目）')) {
          resetProject();
          window.location.hash = '#/import';
          window.location.reload();
        }
      },
    }, '新工程'),
  ),
);
app.append(header);

const page = h('main', { class: 'page', id: 'page' });
app.append(page);

const toastStack = h('div', { class: 'toast-stack' });
app.append(toastStack);

function updateChrome() {
  tabs.forEach((tab, i) => {
    const id = STEPS[i].id;
    tab.classList.toggle('active', store.route === id);
    const done =
      (id === 'align' && store.alignStatus === 'done') ||
      (id === 'edit' && !!store.result) ||
      (id === 'export' && !!store.result);
    tab.classList.toggle('done', done && store.route !== id);
  });
  // toasts
  toastStack.replaceChildren(
    ...store.toasts.map((t) => h('div', { class: `toast ${t.kind}` }, t.text)),
  );
}
subscribe(updateChrome);

/* ---------------- 路由 ---------------- */
let cleanup: (() => void) | void;

function renderRoute() {
  cleanup?.();
  cleanup = undefined;
  page.replaceChildren();
  switch (store.route) {
    case 'import':
      renderImport(page);
      break;
    case 'align':
      cleanup = renderAlign(page);
      break;
    case 'edit':
      cleanup = renderEditor(page);
      break;
    case 'export':
      renderExport(page);
      break;
  }
  updateChrome();
  window.scrollTo({ top: 0 });
}

function applyHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route | '';
  const route: Route = STEPS.some((s) => s.id === raw) ? (raw as Route) : 'import';
  if (route !== store.route) set({ route });
  renderRoute();
}
window.addEventListener('hashchange', applyHash);

/* ---------------- 启动 ---------------- */
function boot() {
  // 刷新后 AudioBuffer 已不存在：示例录音静默重新合成
  if (store.script.length && store.audioIsSample) ensureAudioReady();

  const params = new URLSearchParams(window.location.search);
  const autodemo = params.has('autodemo');
  const hasPersisted = (() => {
    try {
      return !!localStorage.getItem('piying-studio-v1');
    } catch {
      return false;
    }
  })();

  if (autodemo && !store.script.length) {
    const play = PLAYS[0];
    loadSampleAudio(play.id);
    set({
      playId: play.id,
      script: play.lines,
      scriptSourceName: `示例剧目·${play.title}`,
      audioName: `《${play.title}》合成演出录音.wav`,
      audioIsSample: true,
      audioDuration: 0,
    });
  } else if (!hasPersisted && !store.script.length) {
    // 首次访问：自动铺好第一出示例戏，方便直接走完整流程
    const play = PLAYS[0];
    loadSampleAudio(play.id);
    set({
      playId: play.id,
      script: play.lines,
      scriptSourceName: `示例剧目·${play.title}`,
      audioName: `《${play.title}》合成演出录音.wav`,
      audioIsSample: true,
      audioDuration: 0,
    });
  }

  if (!window.location.hash) window.location.hash = '#/import';
  applyHash();

  if (autodemo) {
    void (async () => {
      try {
        if (!store.result) {
          window.location.hash = '#/align';
          // 等路由与音频就绪
          await new Promise((r) => setTimeout(r, 120));
          await startAlignment();
        }
        const target = params.get('goto');
        if (target === 'edit' || target === 'export' || target === 'align') {
          window.location.hash = `#/${target}`;
        }
      } catch (e) {
        console.error(e);
        toast(`自动演示失败：${(e as Error).message}`, 'err');
      }
    })();
  }
}

boot();

// 调试 / 自动化测试钩子
declare global {
  interface Window {
    __studio?: unknown;
  }
}
window.__studio = { store, set, ensureAudioReady };
