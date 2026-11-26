import { useStore } from '../store';
import { parseTimeInput, toEditTime } from '../utils/time';
import { audioEngine } from '../audio/AudioEngine';
import { toast } from '../toast';
import type { Cue, Show } from '../types/domain';

export function CueInspector({ show, cue }: { show: Show; cue: Cue | null }) {
  const updateCue = useStore((s) => s.updateCue);
  const updateChar = useStore((s) => s.updateChar);
  const deleteCue = useStore((s) => s.deleteCue);

  if (!cue) {
    return (
      <div className="card inspector">
        <h2>检查器</h2>
        <div className="empty" style={{ padding: '26px 10px' }}>
          <span className="big">👆</span>
          在波形或左侧列表中点选一条字幕，即可微调时间、修改衬字与普通话释义。
        </div>
        <GapLegend showId={show.id} />
      </div>
    );
  }

  const setTime = (edge: 'start' | 'end', text: string) => {
    const v = parseTimeInput(text);
    if (v === null) {
      toast('时间格式无效，示例 12.3 或 0:12.30');
      return;
    }
    useStore.getState().dragBoundary(cue.id, edge, v);
  };

  return (
    <div className="card inspector">
      <h2 style={{ justifyContent: 'space-between' }}>
        字幕检查器
        <button className="btn btn-danger btn-sm" onClick={() => deleteCue(cue.id)}>
          删除该条
        </button>
      </h2>

      <div className="time-row field">
        <div>
          <label>开始（秒 / 分:秒）</label>
          <input
            key={`s${cue.id}-${cue.start.toFixed(2)}`}
            className="input"
            defaultValue={toEditTime(cue.start)}
            onBlur={(e) => setTime('start', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div>
          <label>结束</label>
          <input
            key={`e${cue.id}-${cue.end.toFixed(2)}`}
            className="input"
            defaultValue={toEditTime(cue.end)}
            onBlur={(e) => setTime('end', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
      </div>

      <div className="field">
        <label>类型</label>
        <div className="row">
          <button
            className={`btn btn-sm ${cue.kind === 'sing' ? 'btn-primary' : ''}`}
            onClick={() => updateCue(cue.id, { kind: 'sing' })}
          >
            唱腔
          </button>
          <button
            className={`btn btn-sm ${cue.kind === 'speak' ? 'btn-jade' : ''}`}
            onClick={() => updateCue(cue.id, { kind: 'speak' })}
          >
            道白
          </button>
          <button className="btn btn-sm" onClick={() => audioEngine.play(show.id, cue.start)}>
            ▶ 试听该条
          </button>
        </div>
      </div>

      <div className="field">
        <label>角色</label>
        <input className="input" value={cue.role ?? ''} onChange={(e) => updateCue(cue.id, { role: e.target.value })} />
      </div>

      <div className="field">
        <label>普通话释义行</label>
        <textarea
          className="textarea"
          style={{ minHeight: 64 }}
          value={cue.mandarin}
          onChange={(e) => updateCue(cue.id, { mandarin: e.target.value })}
          placeholder="配在方言下方的普通话意思"
        />
      </div>

      <div className="field">
        <label>逐字时间与衬字（灰底可直接填成实际唱的字）</label>
        <div className="char-strip">
          {cue.chars.map((ch) =>
            ch.status === 'extra' ? (
              <span key={ch.id} className={`char-chip extra ${ch.longDrag ? 'long' : ''}`} title={`衬字 ${ch.start.toFixed(2)}-${ch.end.toFixed(2)}s`}>
                <input
                  className="extra-input"
                  value={ch.ch === '衬' ? '' : ch.ch}
                  placeholder="衬"
                  maxLength={2}
                  onChange={(e) => updateChar(cue.id, ch.id, { ch: e.target.value || '衬' })}
                />
                <span className="t">{ch.start.toFixed(1)}</span>
              </span>
            ) : (
              <span
                key={ch.id}
                className={`char-chip ${ch.status === 'missing' ? 'missing' : ''} ${ch.longDrag ? 'long' : ''}`}
                title={`${ch.start.toFixed(2)} – ${ch.end.toFixed(2)}s${ch.longDrag ? '（拖腔>3s）' : ''}`}
              >
                {ch.ch}
                <span className="t">{(ch.end - ch.start).toFixed(1)}s</span>
              </span>
            ),
          )}
          {cue.chars.length === 0 && <span className="hint">该条没有字级数据（手动空字幕）。</span>}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          金色下划线表示拖腔超过 3 秒；红色删除线字表示自动对齐未确定，可在波形上拖动该条边界校正。
        </div>
      </div>

      <GapLegend showId={show.id} />
    </div>
  );
}

function GapLegend({ showId }: { showId: string }) {
  const gaps = useStore((s) => s.results[showId]?.gaps ?? []);
  if (!gaps.length) return null;
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>过门留白段（{gaps.length}）</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 150, overflowY: 'auto' }}>
        {gaps.map((g) => (
          <div key={g.id} className="row" style={{ fontSize: 12.5 }}>
            <span className={`tag ${g.type === 'luogu' ? 'tag-sing' : g.type === 'instrumental' ? 'tag-gold' : 'tag-gray'}`}>{g.label}</span>
            <span className="cue-time">
              {toEditTime(g.start)} – {toEditTime(g.end)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
