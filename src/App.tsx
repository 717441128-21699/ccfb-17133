import { useStore, type PageId } from './store';
import { ImportPage } from './pages/ImportPage';
import { AlignPage } from './pages/AlignPage';
import { EditorPage } from './pages/EditorPage';
import { ExportPage } from './pages/ExportPage';
import { Toaster } from './components/Toaster';

const STEPS: { id: PageId; label: string; icon: string }[] = [
  { id: 'import', label: '唱本导入', icon: '📜' },
  { id: 'align', label: '录音对齐', icon: '🎯' },
  { id: 'edit', label: '字幕编辑', icon: '✂️' },
  { id: 'export', label: '导出烧录', icon: '📦' },
];

export default function App() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const activeId = useStore((s) => s.activeShowId);
  const hasResult = !!useStore((s) => s.results[s.activeShowId]);

  const stepState = (id: PageId): 'active' | 'done' | 'locked' | '' => {
    if (id === page) return 'active';
    if ((id === 'edit' || id === 'export') && !hasResult) return 'locked';
    const order: PageId[] = ['import', 'align', 'edit', 'export'];
    if (order.indexOf(id) < order.indexOf(page)) return 'done';
    return '';
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-seal">影</div>
          <div>
            <div className="brand-title">影词台</div>
            <div className="brand-sub">皮影戏方言唱本 · 录音对齐 · 双语字幕</div>
          </div>
        </div>

        <nav className="stepper" aria-label="工作流步骤">
          {STEPS.map((st, i) => {
            const state = stepState(st.id);
            const locked = state === 'locked';
            return (
              <button
                key={st.id}
                className={`step ${state === 'active' ? 'active' : ''} ${state === 'done' ? 'done' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => !locked && setPage(st.id)}
                title={locked ? '请先完成对齐' : st.label}
              >
                <span className="num">{state === 'done' ? '✓' : i + 1}</span>
                <span>
                  {st.icon} {st.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="top-right">
          <span>本地 Web Worker 计算 · 音频不上传</span>
        </div>
      </header>

      <main className="main" key={activeId /* 切戏时重置页面局部状态 */}>
        {page === 'import' && <ImportPage />}
        {page === 'align' && <AlignPage />}
        {page === 'edit' && <EditorPage />}
        {page === 'export' && <ExportPage />}
      </main>
      <Toaster />
    </>
  );
}
