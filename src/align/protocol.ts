import type { AlignResult, BenchReport, Cue, ScriptLine, SubtitleOptions } from '../types';

export type { BenchReport } from '../types';

export type WorkerRequest =
  | {
      type: 'align';
      reqId: number;
      pcm: Float32Array;
      sampleRate: number;
      duration: number;
      script: ScriptLine[];
      options: SubtitleOptions;
    }
  | { type: 'bench'; reqId: number };

export type WorkerResponse =
  | { type: 'progress'; reqId: number; pct: number; message: string }
  | {
      type: 'aligned';
      reqId: number;
      result: AlignResult;
      cues: Cue[];
    }
  | { type: 'benchResult'; reqId: number; report: BenchReport }
  | { type: 'error'; reqId: number; message: string };
