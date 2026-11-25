// Web Worker 客户端：封装对齐请求/进度/Promise。
import AlignWorker from '../align/align.worker?worker';
import type { AlignResult, BenchReport, Cue, SubtitleOptions, ScriptLine } from '../types';
import type { WorkerRequest, WorkerResponse } from '../align/protocol';

interface Pending {
  resolve: (v: { result: AlignResult; cues: Cue[] }) => void;
  reject: (e: Error) => void;
  onProgress?: (pct: number, msg: string) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
const benchPending = new Map<number, { resolve: (r: BenchReport) => void; reject: (e: Error) => void }>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new AlignWorker();
  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.type === 'progress') {
      pending.get(msg.reqId)?.onProgress?.(msg.pct, msg.message);
    } else if (msg.type === 'aligned') {
      const p = pending.get(msg.reqId);
      if (p) {
        pending.delete(msg.reqId);
        p.resolve({ result: msg.result, cues: msg.cues });
      }
    } else if (msg.type === 'benchResult') {
      benchPending.get(msg.reqId)?.resolve(msg.report);
      benchPending.delete(msg.reqId);
    } else if (msg.type === 'error') {
      const p = pending.get(msg.reqId);
      if (p) {
        pending.delete(msg.reqId);
        p.reject(new Error(msg.message));
      }
    }
  };
  worker.onerror = (e) => {
    for (const [id, p] of pending) {
      p.reject(new Error(e.message || 'Worker 运行错误'));
      pending.delete(id);
    }
    for (const [id, p] of benchPending) {
      p.reject(new Error(e.message || 'Worker 运行错误'));
      benchPending.delete(id);
    }
  };
  return worker;
}

export function runAlignment(params: {
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
  script: ScriptLine[];
  options: SubtitleOptions;
  onProgress?: (pct: number, msg: string) => void;
}): Promise<{ result: AlignResult; cues: Cue[] }> {
  const w = ensureWorker();
  const reqId = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject, onProgress: params.onProgress });
    const req: WorkerRequest = {
      type: 'align',
      reqId,
      pcm: params.pcm,
      sampleRate: params.sampleRate,
      duration: params.duration,
      script: params.script,
      options: params.options,
    };
    // PCM 是 getMonoPcm() 新建的副本，转移所有权零拷贝
    w.postMessage(req, [params.pcm.buffer]);
  });
}

export function runBenchmark(): Promise<BenchReport> {
  const w = ensureWorker();
  const reqId = ++seq;
  return new Promise((resolve, reject) => {
    benchPending.set(reqId, { resolve, reject });
    const req: WorkerRequest = { type: 'bench', reqId };
    w.postMessage(req);
  });
}
