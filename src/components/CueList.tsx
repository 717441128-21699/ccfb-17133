import { useStore } from '../store';
import { cueTokens } from '../utils/subtitles';
import { toEditTime } from '../utils/time';
import { audioEngine } from '../audio/AudioEngine';
import { toast } from '../toast';
import type { AlignmentResult, ScriptLine, Show } from '../types/domain';

export function CueList({ show, result }: { show: Show; result: AlignmentResult }) {
  const selectedCueId = useStore((s) => s.selectedCueId);
  const selectCue = useStore((s) => s.selectCue);
  const addCueForLine = useStore((s) => s.addCueForLine);

  const lineById = new Map<string, ScriptLine>(show.script.map((l) => [l.id, l]));
  const alignedLineIds = new Set(result.cue.map((c) => c.lineId).filter(Boolean) as string[]);
  const missingLines = show.script.filter((l) => !alignedLineIds.has(l.id));

  return (
    <div>
      {missingLines.length > 0 && (
      <div style={{ marginBottom: 16 }}>
        <h3
          className="serif"
          style={{ fontSize: 16, color: 'var(--warn-ink)', margin: '0 0 9px', display: 'flex', alignItems: 'center', gap: 7 }}
        >
          🚩 唱本有、录音没唱的句子（{missingLines.length}）· 标黄提醒
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {missingLines.map((line) => (
            <div key={line.id} className="cue-card missing-line">
              <div className="cue-top">
                <span className={`tag ${line.kind === 'sing' ? 'tag-sing' : 'tag-speak'}`}>{line.kind === 'sing' ? '唱腔' : '道白'}</span>
                {line.role && <b style={{ fontSize: 13 }}>{line.role}</b>}
                <span className="tag tag-warn">未演唱</span>
                <div className="spacer" />
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    addCueForLine(line.id, audioEngine.currentTime || 0);
                    toast('已在当前播放头补建字幕，可拖动对齐');
                  }}
                >
                  ＋ 在播放头补配
                </button>
              </div>
              <div className="cue-dialect" style={{ color: '#6b5310' }}>
                {line.dialect}
              </div>
              {line.mandarin && <div className="cue-mandarin">{line.mandarin}</div>}
            </div>
          ))}
        </div>
      </div>
      )}

      <h3 className="serif" style={{ fontSize: 16, margin: '0 0 9px' }}>
        字幕条（{result.cue.length}）
      </h3>
      <div className="cue-list">
        {[...result.cue]
          .sort((a, b) => a.start - b.start)
          .map((cue) => {
            const line = cue.lineId ? lineById.get(cue.lineId) : undefined;
            const tokens = cueTokens(cue, line);
            const hasLong = cue.chars.some((c) => c.longDrag);
            return (
              <div
                key={cue.id}
                className={`cue-card ${cue.kind === 'speak' ? 'kind-speak' : ''} ${selectedCueId === cue.id ? 'selected' : ''} ${cue.improvised ? 'improvised' : ''}`}
                onClick={() => {
                  selectCue(cue.id);
                  audioEngine.seek(show.id, cue.start + 0.01);
                }}
              >
                <div className="cue-top">
                  <span className={`tag ${cue.kind === 'sing' ? 'tag-sing' : 'tag-speak'}`}>{cue.kind === 'sing' ? '唱' : '白'}</span>
                  {cue.role && <b style={{ fontSize: 12.5 }}>{cue.role}</b>}
                  <span className="cue-time">
                    {toEditTime(cue.start)} → {toEditTime(cue.end)}
                  </span>
                  {hasLong && <span className="drag-badge">拖腔 {Math.max(...cue.chars.map((c) => c.end - c.start)).toFixed(1)}s</span>}
                  {cue.improvised && <span className="tag tag-gray">临场加句</span>}
                </div>
                <div className="cue-dialect">
                  {tokens.map((tk, i) =>
                    tk.kind === 'extra' ? (
                      <span key={i} className="token-extra" title="临场加入的衬字">
                        {tk.text}
                      </span>
                    ) : tk.kind === 'missing' ? (
                      <span key={i} className="token-missing" title="自动对齐未确定该字，可在右侧校正">
                        {tk.text}
                      </span>
                    ) : (
                      <span key={i}>{tk.text}</span>
                    ),
                  )}
                </div>
                {cue.mandarin && <div className="cue-mandarin">普：{cue.mandarin}</div>}
              </div>
            );
          })}
      </div>
    </div>
  );
}
