import { useRef, useState } from 'react';
import { useStore } from '../store';
import { parseScriptText, serializeScript } from '../utils/text';
import { audioEngine } from '../audio/AudioEngine';
import { toast } from '../toast';
import type { ScriptLine } from '../types/domain';

const TEMPLATE = `【孙悟空】（唱）河东城刮起了呼呼大风， || 河东一带刮起了大风，
【铁扇公主】（白）你这泼猴，又来做甚？ || 你这猴子，又来干什么？
孙悟空（白）嫂嫂息怒，借扇一用。 || 嫂嫂别生气，把扇子借我用一下。`;

export function ImportPage() {
  const shows = useStore((s) => s.shows);
  const activeId = useStore((s) => s.activeShowId);
  const setActiveShow = useStore((s) => s.setActiveShow);
  const addImportedShow = useStore((s) => s.addImportedShow);
  const setPage = useStore((s) => s.setPage);
  const setMediaName = useStore((s) => s.setMediaName);
  const audioInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [pendingAudio, setPendingAudio] = useState<File | null>(null);
  const [preview, setPreview] = useState<ScriptLine[] | null>(null);

  const builtins = shows.filter((s) => s.builtin);
  const imported = shows.filter((s) => !s.builtin);

  const onPickAudio = (f: File | undefined | null) => {
    if (!f) return;
    setPendingAudio(f);
    toast(`已选择录音：${f.name}`);
  };

  const readScriptFile = async (f: File) => {
    const content = await f.text();
    setText(content);
    setPreview(parseScriptText(content));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    toast('唱本文件已读取');
  };

  const doImport = () => {
    const lines = preview ?? parseScriptText(text);
    if (!lines.length) {
      toast('没有解析到有效唱句，请检查格式');
      return;
    }
    const id = addImportedShow(title.trim() || '未命名影戏', lines, pendingAudio?.name);
    if (pendingAudio) {
      audioEngine
        .decodeFile(pendingAudio)
        .then((buf) => audioEngine.setBuffer(id, buf))
        .catch(() => toast('录音解码失败，可在对齐页重试'));
      setMediaName(id, pendingAudio.name);
    }
    toast(`已导入 ${lines.length} 句唱本`);
    setPage('align');
  };

  const loadSampleScript = () => {
    setText(TEMPLATE);
    setPreview(parseScriptText(TEMPLATE));
    setTitle('示例新唱本');
  };

  return (
    <div>
      <div className="page-head">
        <h1>📜 唱本导入</h1>
        <p>
          中心自编了三出带方言唱本与演出录音的示例影戏，可直接走一遍“对齐 → 编辑 → 导出”。
          也可以粘贴老艺人口述整理稿，或导入 <span className="kbd">.txt</span> 唱本与录音文件，全部计算都在本机浏览器内完成。
        </p>
      </div>

      <h2 className="serif" style={{ fontSize: 21, margin: '4px 0 14px', letterSpacing: 2 }}>
        🎭 示例戏箱（方言唱本 + 自编录音）
      </h2>
      <div className="show-grid" style={{ marginBottom: 26 }}>
        {builtins.map((show) => {
          const sing = show.script.filter((l) => l.kind === 'sing').length;
          const speak = show.script.length - sing;
          const missing = Object.values(show.perf.lines).filter((p) => p.sung === false).length;
          return (
            <div
              key={show.id}
              className={`show-card ${activeId === show.id ? 'selected' : ''}`}
              onClick={() => setActiveShow(show.id)}
              onDoubleClick={() => setPage('align')}
            >
              <div className="show-tags">
                <span className="tag tag-gold">{show.troupe}</span>
                <span className="tag tag-gray">{show.category}</span>
              </div>
              <h3>{show.title}</h3>
              <div className="show-meta">
                {show.script.length} 句 · <span style={{ color: 'var(--vermilion)' }}>唱 {sing}</span> ·{' '}
                <span style={{ color: 'var(--jade)' }}>白 {speak}</span>
                {missing > 0 && <span className="tag tag-warn" style={{ marginLeft: 8 }}>含漏句演示</span>}
              </div>
              <p className="show-summary">{show.summary}</p>
              <div className="row">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveShow(show.id);
                    setPage('align');
                  }}
                >
                  用这出戏对齐 →
                </button>
                <span className="hint">单击选中，双击进入</span>
              </div>
            </div>
          );
        })}
      </div>

      {imported.length > 0 && (
        <>
          <h2 className="serif" style={{ fontSize: 19, margin: '0 0 12px' }}>
            🗂 我导入的唱本
          </h2>
          <div className="show-grid" style={{ marginBottom: 26 }}>
            {imported.map((show) => (
              <div key={show.id} className={`show-card ${activeId === show.id ? 'selected' : ''}`} onClick={() => setActiveShow(show.id)}>
                <h3>{show.title}</h3>
                <div className="show-meta">{show.script.length} 句 · 用户导入</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveShow(show.id);
                      setPage('align');
                    }}
                  >
                    去对齐 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>粘贴 / 上传唱本</h2>
          <div className="field">
            <label>剧目名称</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：周仁回府·悔路" />
          </div>
          <div className="field">
            <label>唱本正文</label>
            <textarea
              className="textarea"
              style={{ minHeight: 220 }}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(parseScriptText(e.target.value));
              }}
              placeholder={TEMPLATE}
            />
          </div>
          <div className="row">
            <label className="btn">
              📄 选择 .txt 唱本
              <input
                type="file"
                accept=".txt,.md,.text"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && readScriptFile(e.target.files[0])}
              />
            </label>
            <button className="btn btn-ghost btn-sm" onClick={loadSampleScript}>
              填入格式模板
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setText(serializeScript(parseScriptText(TEMPLATE)))}>
              重排为标准格式
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <label
              className="dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('drag');
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('drag')}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('drag');
                onPickAudio(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="big">🎧</span>
              <div>
                <b>点此或拖入演出录音 / 视频</b>（mp3 / wav / m4a / mp4 音轨均可）
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {pendingAudio ? `已选择：${pendingAudio.name}（${(pendingAudio.size / 1024 / 1024).toFixed(1)} MB）` : '也可先导入唱本，稍后在对齐页选择录音'}
              </div>
              <input
                ref={audioInput}
                type="file"
                accept="audio/*,video/*"
                style={{ display: 'none' }}
                onChange={(e) => onPickAudio(e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn btn-primary btn-lg" onClick={doImport} disabled={!text.trim()}>
              导入唱本并去对齐 →
            </button>
            {!text.trim() && <span className="hint">先粘贴唱词或选择示例戏箱中的剧目</span>}
          </div>
        </div>

        <div className="card">
          <h2>解析预览与格式说明</h2>
          {preview && preview.length > 0 ? (
            <>
              <div className="stats-grid" style={{ marginBottom: 14 }}>
                <div className="stat">
                  <div className="v">{preview.length}</div>
                  <div className="k">解析出的句段</div>
                </div>
                <div className="stat">
                  <div className="v">{preview.filter((l) => l.kind === 'sing').length}</div>
                  <div className="k">唱腔</div>
                </div>
                <div className="stat jade">
                  <div className="v">{preview.filter((l) => l.kind === 'speak').length}</div>
                  <div className="k">道白</div>
                </div>
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preview.map((l) => (
                  <div key={l.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 11px', background: 'var(--paper-3)' }}>
                    <div className="row" style={{ marginBottom: 3 }}>
                      <span className={`tag ${l.kind === 'sing' ? 'tag-sing' : 'tag-speak'}`}>{l.kind === 'sing' ? '唱' : '白'}</span>
                      {l.role && <b style={{ fontSize: 13 }}>{l.role}</b>}
                    </div>
                    <div style={{ fontSize: 15 }}>{l.dialect}</div>
                    {l.mandarin && <div className="hint">普：{l.mandarin}</div>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">
              <span className="big">📝</span>
              粘贴唱本后这里会显示解析结果
            </div>
          )}

          <div className="callout info" style={{ marginTop: 16 }}>
            <span className="ico">ℹ️</span>
            <div>
              每行一句，推荐格式：<br />
              <code>【角色】（唱/白）方言唱词 || 普通话释义</code>
              <br />
              也兼容 <code>角色(白): 台词</code>、<code>唱：…</code> 等写法。<code>||</code> 后是普通话意思，可留空。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
