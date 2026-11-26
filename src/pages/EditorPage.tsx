import { useEffect } from 'react';
import { useStore } from '../store';
import { Waveform } from '../components/Waveform';
import { PreviewStage } from '../components/PreviewStage';
import { CueList } from '../components/CueList';
import { CueInspector } from '../components/CueInspector';
import { audioEngine } from '../audio/AudioEngine';
import { toast } from '../toast';

export function EditorPage() {
  const show = useStore((s) => s.shows.find((x) => x.id === s.activeShowId) ?? s.shows[0]);
  const result = useStore((s) => s.results[show.id]);
  const selectedCueId = useStore((s) => s.selectedCueId);
  const maxChars = useStore((s) => s.maxChars);
  const setMaxChars = useStore((s) => s.setMaxChars);
  const bilingual = useStore((s) => s.bilingual);
  const setBilingual = useStore((s) => s.setBilingual);
  const setPage = useStore((s) => s.setPage);
  const addCueAt = useStore((s) => s.addCueAt);

  // 保险：进入编辑页时确保示例音频已加载
  useEffect(() => {
    if (result && show.builtin && show.audioFile && !audioEngine.hasBuffer(show.id)) {
      audioEngine.loadUrl(show.id, `/${show.audioFile}`).catch(() => toast('音频加载失败'));
    }
  }, [result, show]);

  // 空格播放/暂停
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        if (audioEngine.isPlaying(show.id)) audioEngine.pause();
        else void audioEngine.play(show.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show.id]);

  if (!result) {
    return (
      <div className="card">
        <div className="empty">
          <span className="big">🧭</span>
          <h2 style={{ justifyContent: 'center' }}>还没有对齐结果</h2>
          <p>请先到“录音对齐”页运行自动对齐，再来微调字幕。</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 12 }} onClick={() => setPage('align')}>
            前往对齐 →
          </button>
        </div>
      </div>
    );
  }

  const selectedCue = result.cue.find((c) => c.id === selectedCueId) ?? null;

  return (
    <div>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>✂️ 字幕编辑 · {show.title}</h1>
          <p>拖动波形边界微调；黄卡是唱本有但没唱的句子，灰字是临场衬字；长拖腔自动保持字幕，锣鼓/器乐段不留字幕。</p>
        </div>
        <div className="row" style={{ gap: 16 }}>
          <div className="row">
            <span className="hint">每行上限</span>
            <input
              type="range"
              min={8}
              max={24}
              value={maxChars}
              onChange={(e) => setMaxChars(parseInt(e.target.value, 10))}
            />
            <b style={{ minWidth: 44 }}>{maxChars} 字</b>
          </div>
          <button className="switch-row" onClick={() => setBilingual(!bilingual)}>
            <span className={`switch ${bilingual ? 'on' : ''}`} />
            普通话行
          </button>
          <button className="btn" onClick={() => addCueAt(audioEngine.currentTime)}>
            ＋ 在播放头加空条
          </button>
          <button className="btn btn-primary" onClick={() => setPage('export')}>
            去导出 →
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Waveform show={show} result={result} />
      </div>

      <div style={{ marginBottom: 18, maxWidth: 760 }}>
        <PreviewStage show={show} result={result} />
      </div>

      <div className="grid-edit">
        <CueList show={show} result={result} />
        <div style={{ position: 'sticky', top: 84 }}>
          <CueInspector show={show} cue={selectedCue} />
        </div>
      </div>
    </div>
  );
}
