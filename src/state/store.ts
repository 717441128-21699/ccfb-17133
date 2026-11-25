import type {
  AlignResult,
  BenchReport,
  Cue,
  ScriptLine,
  SubtitleOptions,
} from '../types';
import { DEFAULT_SUBTITLE_OPTIONS } from '../subtitles/cues';

export type Route = 'import' | 'align' | 'edit' | 'export';
export type AlignStatus = 'idle' | 'working' | 'done' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'err';
  text: string;
}

interface PersistShape {
  playId: string;
  script: ScriptLine[];
  scriptSourceName: string;
  cues: Cue[];
  result: AlignResult | null;
  options: SubtitleOptions;
  audioName: string;
  audioIsSample: boolean;
}

interface State extends PersistShape {
  route: Route;
  audioDuration: number;
  alignStatus: AlignStatus;
  progressPct: number;
  progressMsg: string;
  alignError: string;
  selectedCueId: string | null;
  bench: BenchReport | null;
  benchRunning: boolean;
  videoUrl: string | null;
  videoName: string | null;
  toasts: Toast[];
}

const STORAGE_KEY = 'piying-studio-v1';

function loadPersisted(): Partial<PersistShape> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistShape;
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

export const store: State = {
  route: 'import',
  playId: persisted.playId ?? 'ganjiao',
  script: persisted.script ?? [],
  scriptSourceName: persisted.scriptSourceName ?? '',
  cues: persisted.cues ?? [],
  result: persisted.result ?? null,
  options: { ...DEFAULT_SUBTITLE_OPTIONS, ...(persisted.options ?? {}) },
  audioName: persisted.audioName ?? '',
  audioIsSample: persisted.audioIsSample ?? true,
  audioDuration: persisted.result?.duration ?? 0,
  alignStatus: persisted.result ? 'done' : 'idle',
  progressPct: 0,
  progressMsg: '',
  alignError: '',
  selectedCueId: null,
  bench: null,
  benchRunning: false,
  videoUrl: null,
  videoName: null,
  toasts: [],
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function set(patch: Partial<State>): void {
  Object.assign(store, patch);
  listeners.forEach((fn) => fn());
  schedulePersist();
}

let persistTimer = 0;
function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      const data: PersistShape = {
        playId: store.playId,
        script: store.script,
        scriptSourceName: store.scriptSourceName,
        cues: store.cues,
        result: store.result,
        options: store.options,
        audioName: store.audioName,
        audioIsSample: store.audioIsSample,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 配额不足时忽略 */
    }
  }, 400);
}

/** 高频本地编辑后请求一次防抖持久化（不触发全局渲染） */
export function persistSoon() {
  schedulePersist();
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  set({ toasts: [...store.toasts, { id, kind, text }] });
  window.setTimeout(() => {
    set({ toasts: store.toasts.filter((t) => t.id !== id) });
  }, 3600);
}

export function resetProject() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  set({
    script: [],
    cues: [],
    result: null,
    alignStatus: 'idle',
    progressPct: 0,
    audioName: '',
    audioDuration: 0,
    selectedCueId: null,
    alignError: '',
  });
}
