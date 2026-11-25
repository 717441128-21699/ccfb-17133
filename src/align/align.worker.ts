// 对齐计算 Web Worker：解码后的 PCM -> DSP -> 两级模糊对齐 -> cue 规则。
// UI 线程只负责波形与播放，不被计算阻塞。

import { analyzePcm } from './dsp';
import { alignScript } from './engine';
import { buildCues } from '../subtitles/cues';
import { runScaleBenchmark } from './bench';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface MinimalWorkerScope {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const ctx = self as unknown as MinimalWorkerScope;

function post(msg: WorkerResponse) {
  ctx.postMessage(msg);
}

ctx.onmessage = (ev) => {
  const req = ev.data;
  try {
    if (req.type === 'bench') {
      const report = runScaleBenchmark();
      post({ type: 'benchResult', reqId: req.reqId, report });
      return;
    }
    if (req.type !== 'align') return;

    const started = performance.now();
    post({ type: 'progress', reqId: req.reqId, pct: 0.08, message: 'Worker 已接收音频，开始能量分析…' });
    const segments = analyzePcm(req.pcm, req.sampleRate, {
      onProgress: (pct, message) =>
        post({ type: 'progress', reqId: req.reqId, pct: 0.1 + pct * 0.45, message }),
    });

    post({ type: 'progress', reqId: req.reqId, pct: 0.6, message: '正在进行唱本—音节模糊对齐…' });
    const result = alignScript(req.script, segments, req.duration);
    // 对外展示含 DSP + DP 的完整 Worker 计算耗时
    result.stats.elapsedMs = Math.round((performance.now() - started) * 10) / 10;

    post({ type: 'progress', reqId: req.reqId, pct: 0.85, message: '正在生成字幕与拖腔/过门规则…' });
    const cues = buildCues(req.script, result, req.options);

    post({ type: 'progress', reqId: req.reqId, pct: 1, message: '对齐完成' });
    post({ type: 'aligned', reqId: req.reqId, result, cues });
  } catch (err) {
    post({
      type: 'error',
      reqId: req.reqId,
      message: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
    });
  }
};
