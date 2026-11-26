/// <reference lib="webworker" />
import { alignAudio, benchmarkTwoHours, DEFAULT_ALIGN_OPTIONS } from '../alignment/engine';
import type { AlignOptions, ScriptLine } from '../types/domain';

export interface AlignRequest {
  type: 'align';
  id: number;
  channel: Float32Array;
  sampleRate: number;
  script: ScriptLine[];
  options?: AlignOptions;
}
export interface BenchRequest {
  type: 'bench';
  id: number;
}
export type WorkerRequest = AlignRequest | BenchRequest;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type === 'bench') {
    const bench = benchmarkTwoHours();
    ctx.postMessage({ type: 'bench', id: req.id, bench });
    return;
  }
  try {
    const result = alignAudio(
      req.channel,
      req.sampleRate,
      req.script,
      req.options ?? DEFAULT_ALIGN_OPTIONS,
      (stage, pct) => {
        ctx.postMessage({ type: 'progress', id: req.id, stage, pct });
      },
    );
    // result 是纯数据，可结构化克隆
    ctx.postMessage({ type: 'result', id: req.id, result });
  } catch (err) {
    ctx.postMessage({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
