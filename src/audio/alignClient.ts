import AlignmentWorker from '../workers/alignment.worker?worker';
import type { AlignOptions, AlignmentResult, ScriptLine } from '../types/domain';
import type { BenchResult } from '../alignment/engine';

interface Pending {
  resolve: (r: AlignmentResult) => void;
  reject: (e: Error) => void;
  onProgress?: (stage: string, pct: number) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let benchResolve: ((b: BenchResult) => void) | null = null;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new AlignmentWorker();
  worker.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as
      | { type: 'progress'; id: number; stage: string; pct: number }
      | { type: 'result'; id: number; result: AlignmentResult }
      | { type: 'error'; id: number; message: string }
      | { type: 'bench'; id: number; bench: BenchResult };
    if (msg.type === 'bench') {
      benchResolve?.(msg.bench);
      benchResolve = null;
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') p.onProgress?.(msg.stage, msg.pct);
    if (msg.type === 'result') {
      pending.delete(msg.id);
      p.resolve(msg.result);
    }
    if (msg.type === 'error') {
      pending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  };
  return worker;
}

/** 在 Web Worker 中执行对齐；channel 会被 transfer，调用方需另存副本 */
export function runAlignment(
  channel: Float32Array,
  sampleRate: number,
  script: ScriptLine[],
  options: AlignOptions,
  onProgress?: (stage: string, pct: number) => void,
): Promise<AlignmentResult> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const copy = new Float32Array(channel); // 复制一份再 transfer，避免 neuter 播放缓冲
    w.postMessage({ type: 'align', id, channel: copy, sampleRate, script, options }, [copy.buffer]);
  });
}

export function runBenchmark(): Promise<BenchResult> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise((resolve) => {
    benchResolve = resolve;
    w.postMessage({ type: 'bench', id });
  });
}
