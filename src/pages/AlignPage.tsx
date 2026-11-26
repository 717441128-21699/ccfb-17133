import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { audioEngine } from '../audio/AudioEngine';
import { mixToMonoResampled } from '../audio/bufferUtils';
import { runAlignment, runBenchmark } from '../audio/alignClient';
import type { BenchResult } from '../alignment/engine';
import { toast } from '../toast';

export function AlignPage() {
  const show = useStore((s) => s.shows.find((x) => x.id === s.activeShowId) ?? s.shows[0]);
  const result = useStore((s) => s.results[show.id]);
  const job = useStore((s) => s.job);
  const setJob = useStore((s) => s.setJob);
  const setResult = useStore((s) => s.setResult);
  const setPage = useStore((s) => s.setPage);
  const options = useStore((s) => s.alignOptions);
  const setOptions = useStore((s) => s.setAlignOptions);
  const mediaName = useStore((s) => s.mediaNames[show.id]);
  const setMediaName = useStore((s) => s.setMediaName);

  const [audioReady, setAudioReady] = useState(audioEngine.hasBuffer(show.id));
  const [audioError, setAudioError] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [benching, setBenching] = useState(false);

  // 载入内置示例 WAV
  useEffect(() => {
    let alive = true;
    setAudioReady(audioEngine.hasBuffer(show.id));
    setAudioError(null);
    if (show.builtin && show.audioFile && !audioEngine.hasBuffer(show.id)) {
      setLoadingAudio(true);
      audioEngine
        .loadUrl(show.id, `/${show.audioFile}`)
        .then(() => alive && setAudioReady(true))
        .catch((e) => alive && setAudioError(String(e?.message ?? e)))
        .finally(() => alive && setLoadingAudio(false));
    }
    return () => {
      alive = false;
    };
  }, [show.id, show.builtin, show.audioFile]);

  const onUploadAudio = async (f: File | undefined | null) => {
    if (!f) return;
    try {
      setLoadingAudio(true);
      const buf = await audioEngine.decodeFile(f);
      audioEngine.setBuffer(show.id, buf);
      setAudioReady(true);
      setMediaName(show.id, f.name);
      setAudioError(null);
      toast('录音解码成功');
    } catch (e) {
      toast('解码失败，请尝试 wav/mp3/m4a');
      setAudioError(String(e));
    } finally {
      setLoadingAudio(false);
    }
  };

  const startAlign = async () => {
    const buf = audioEngine.getBuffer(show.id);
    if (!buf) {
      toast('录音还没准备好');
      return;
    }
    setJob({ status: 'working', progress: 0.04, stage: '准备音频…', error: undefined });
    try {
      // 统一重采样到 22050 单声道，保证对齐阈值/帧参数与环境采样率无关
      const { data, sampleRate } = mixToMonoResampled(buf, 22050);
      const r = await runAlignment(data, sampleRate, show.script, options, (stage, pct) =>
        setJob({ status: 'working', stage, progress: pct }),
      );
      setResult(show.id, r);
      toast(`对齐完成：${r.cue.length} 条字幕，引擎耗时 ${r.stats.engineMs}ms`);
    } catch (e) {
      setJob({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      toast('对齐失败：' + (e instanceof Error ? e.message : ''));
    }
  };

  const doBench = async () => {
    setBenching(true);
    try {
      setBench(await runBenchmark());
    } finally {
      setBenching(false);
    }
  };

  const missingLines = show.script.filter((l) => !result?.cue.some((c) => c.lineId === l.id));

  return (
    <div>
      <div className="page-head">
        <h1>🎯 录音对齐</h1>
        <p>
          当前剧目：<b>{show.title}</b>（{show.troupe}）。对齐在 <b>Web Worker</b> 中运行：先提取能量 / 过零率 / 高频特征，
          识别锣鼓过门并切分唱字音节，再做句级与字级动态规整，允许漏句与临场衬字而不整段错位。
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>录音来源</h2>
          <div className="row" style={{ marginBottom: 14 }}>
            <span className={`tag ${audioReady ? 'tag-jade' : 'tag-gray'}`} style={{ fontSize: 13, padding: '4px 12px' }}>
              {audioReady ? '● 音频就绪' : loadingAudio ? '… 音频加载中' : '○ 未载入音频'}
            </span>
            {mediaName && <span className="hint">文件：{mediaName}</span>}
            {show.builtin && !mediaName && <span className="hint">自编示例录音：{show.audioFile}</span>}
          </div>

          <label className="dropzone" style={{ padding: 18 }}>
            <span className="big">🎚️</span>
            <div>
              <b>更换 / 上传录音或含音轨视频</b>
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              支持 wav / mp3 / m4a / ogg / mp4，解码与计算均在本机进行
            </div>
            <input
              type="file"
              accept="audio/*,video/*"
              style={{ display: 'none' }}
              onChange={(e) => onUploadAudio(e.target.files?.[0])}
            />
          </label>
          {audioError && (
            <div className="callout warn" style={{ marginTop: 12 }}>
              <span className="ico">⚠️</span>
              <div>示例音频加载失败（{audioError}）。可改为上传自己的录音；也可运行 <code>npm run gen:samples</code> 生成 WAV。</div>
            </div>
          )}

          <h2 style={{ marginTop: 22 }}>对齐参数</h2>
          <div className="field">
            <label>检测灵敏度：{options.sensitivity.toFixed(2)}</label>
            <input
              type="range"
              min={0.3}
              max={0.85}
              step={0.01}
              value={options.sensitivity}
              onChange={(e) => setOptions({ sensitivity: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div className="hint">越高越能检出弱唱字，但可能把气口噪声也当成音节。</div>
          </div>
          <div className="field">
            <label>句间停顿阈值：{options.lineGap.toFixed(2)} 秒</label>
            <input
              type="range"
              min={0.28}
              max={0.7}
              step={0.01}
              value={options.lineGap}
              onChange={(e) => setOptions({ lineGap: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div className="hint">大于该静默间隔即视为相邻两句。</div>
          </div>

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn btn-primary btn-lg" onClick={startAlign} disabled={!audioReady || job.status === 'working'}>
              {job.status === 'working' ? '对齐计算中…' : result ? '↻ 重新自动对齐' : '⚡ 开始自动对齐'}
            </button>
            {result && (
              <button className="btn btn-jade btn-lg" onClick={() => setPage('edit')}>
                前往字幕编辑 →
              </button>
            )}
          </div>

          {job.status === 'working' && (
            <div style={{ marginTop: 18 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 7 }}>
                <b style={{ fontSize: 14 }}>{job.stage}</b>
                <span className="hint">{Math.round(job.progress * 100)}%</span>
              </div>
              <div className="progress">
                <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                对齐运行在独立 Web Worker 线程，波形界面不会卡顿。
              </div>
            </div>
          )}
          {job.status === 'error' && (
            <div className="callout warn" style={{ marginTop: 16 }}>
              <span className="ico">✕</span>
              <div>{job.error}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>对齐结果概览</h2>
          {!result ? (
            <div className="empty">
              <span className="big">🧭</span>
              点击“开始自动对齐”后，这里会给出句数、字数、衬字、漏句与锣鼓段统计。
            </div>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat">
                  <div className="v">{result.cue.length}</div>
                  <div className="k">生成字幕条</div>
                </div>
                <div className="stat">
                  <div className="v">{result.stats.matchedChars}</div>
                  <div className="k">对齐正字</div>
                </div>
                <div className="stat">
                  <div className="v">{result.stats.extraChars}</div>
                  <div className="k">检出临场衬字</div>
                </div>
                <div className="stat warn">
                  <div className="v">{missingLines.length}</div>
                  <div className="k">唱本有 / 录音无（标黄）</div>
                </div>
                <div className="stat jade">
                  <div className="v">{result.gaps.length}</div>
                  <div className="k">过门留白段</div>
                </div>
                <div className="stat">
                  <div className="v">{result.stats.engineMs}<span style={{ fontSize: 14 }}>ms</span></div>
                  <div className="k">本出对齐耗时</div>
                </div>
              </div>

              {missingLines.length > 0 && (
                <div className="callout warn" style={{ marginTop: 16 }}>
                  <span className="ico">🚩</span>
                  <div>
                    <b>{missingLines.length} 句唱本内容在录音中没有唱到</b>，已在编辑页用黄色标出：
                    {missingLines.map((l) => (
                      <div key={l.id} style={{ marginTop: 4 }}>
                        「{l.dialect.slice(0, 22)}
                        {l.dialect.length > 22 ? '…' : ''}」
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="callout info" style={{ marginTop: 14 }}>
                <span className="ico">✅</span>
                <div>
                  字级时间已包含拖腔保持规则：超过 3 秒的长拖腔会让该条字幕停留到拖腔结束之后；锣鼓与纯器乐段不排字幕。可在编辑页波形上拖动边界微调。
                </div>
              </div>
            </>
          )}

          <h2 style={{ marginTop: 24 }}>两小时全本性能自测</h2>
          <p className="hint" style={{ marginTop: -6 }}>
            构造约 11900 唱字 / 340 句的两小时量级数据，实测动态规整耗时，并按真实音频的特征提取吞吐外推全流程。
          </p>
          <div className="row">
            <button className="btn" onClick={doBench} disabled={benching}>
              {benching ? '自测中…' : '⏱ 运行 2 小时规模自测'}
            </button>
            {bench && (
              <span className={`tag ${bench.pass ? 'tag-jade' : 'tag-warn'}`} style={{ fontSize: 13, padding: '5px 12px' }}>
                预计 {bench.estimatedTwoHoursMs >= 60000 ? `${(bench.estimatedTwoHoursMs / 60000).toFixed(1)} 分钟` : `${(bench.estimatedTwoHoursMs / 1000).toFixed(1)} 秒`}
                ，预算 5 分钟 · {bench.pass ? '达标' : '不达标'}
              </span>
            )}
          </div>
          {bench && (
            <div className="hint" style={{ marginTop: 10 }}>
              字级/句级 DP {bench.dpMs}ms；特征提取约 {bench.featureThroughputX}× 实时速度；处理 {bench.chars} 字 / {bench.segments} 音节。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
