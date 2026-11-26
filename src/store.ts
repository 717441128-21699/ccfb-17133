import { create } from 'zustand';
import type {
  AlignmentResult,
  AlignOptions,
  Cue,
  ScriptLine,
  Show,
} from './types/domain';
import { SAMPLE_SHOWS } from './data/samples';
import { minimumCueEnd } from './alignment/engine';
import { nextId, spokenChars } from './utils/text';

export type PageId = 'import' | 'align' | 'edit' | 'export';

interface JobState {
  status: 'idle' | 'working' | 'done' | 'error';
  progress: number;
  stage: string;
  error?: string;
}

interface State {
  page: PageId;
  shows: Show[];
  activeShowId: string;
  results: Record<string, AlignmentResult>;
  job: JobState;
  alignOptions: AlignOptions;
  maxChars: number;
  bilingual: boolean;
  selectedCueId: string | null;
  mediaNames: Record<string, string>;
  videoName: string | null;

  setPage: (p: PageId) => void;
  setActiveShow: (id: string) => void;
  addImportedShow: (title: string, lines: ScriptLine[], mediaName?: string) => string;
  setMediaName: (id: string, name: string) => void;
  setVideoName: (name: string | null) => void;
  setJob: (j: Partial<JobState>) => void;
  setResult: (id: string, r: AlignmentResult) => void;
  setAlignOptions: (o: Partial<AlignOptions>) => void;
  setMaxChars: (n: number) => void;
  setBilingual: (b: boolean) => void;
  selectCue: (id: string | null) => void;

  updateCue: (cueId: string, patch: Partial<Cue>) => void;
  updateChar: (cueId: string, charId: string, patch: { start?: number; end?: number; ch?: string }) => void;
  dragBoundary: (cueId: string, edge: 'start' | 'end', time: number) => void;
  moveCue: (cueId: string, start: number) => void;
  addCueForLine: (lineId: string, at: number) => void;
  addCueAt: (at: number) => void;
  deleteCue: (cueId: string) => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export const useStore = create<State>((set, get) => ({
  page: 'import',
  shows: SAMPLE_SHOWS,
  activeShowId: SAMPLE_SHOWS[0].id,
  results: {},
  job: { status: 'idle', progress: 0, stage: '' },
  alignOptions: { sensitivity: 0.55, lineGap: 0.42 },
  maxChars: 16,
  bilingual: true,
  selectedCueId: null,
  mediaNames: {},
  videoName: null,

  setPage: (page) => set({ page }),
  setActiveShow: (id) => set({ activeShowId: id, selectedCueId: null }),
  setVideoName: (videoName) => set({ videoName }),

  addImportedShow: (title, lines, mediaName) => {
    const id = `imp_${Date.now().toString(36)}`;
    const show: Show = {
      id,
      title,
      troupe: '用户导入',
      category: '自定义唱本',
      summary: `${lines.length} 句，可导入录音后自动对齐。`,
      builtin: false,
      script: lines,
      perf: { lines: {} },
    };
    set((s) => ({
      shows: [...s.shows, show],
      activeShowId: id,
      page: 'align',
      mediaNames: mediaName ? { ...s.mediaNames, [id]: mediaName } : s.mediaNames,
    }));
    return id;
  },

  setMediaName: (id, name) => set((s) => ({ mediaNames: { ...s.mediaNames, [id]: name } })),

  setJob: (j) => set((st) => ({ job: { ...st.job, ...j } })),
  setResult: (id, r) =>
    set((st) => ({ results: { ...st.results, [id]: r }, job: { status: 'done', progress: 1, stage: '对齐完成' } })),

  setAlignOptions: (o) => set((st) => ({ alignOptions: { ...st.alignOptions, ...o } })),
  setMaxChars: (n) => set({ maxChars: clamp(Math.round(n), 6, 30) }),
  setBilingual: (b) => set({ bilingual: b }),
  selectCue: (selectedCueId) => set({ selectedCueId }),

  updateCue: (cueId, patch) =>
    set((st) => {
      const id = st.activeShowId;
      const r = st.results[id];
      if (!r) return {};
      return {
        results: {
          ...st.results,
          [id]: { ...r, cue: r.cue.map((c) => (c.id === cueId ? { ...c, ...patch } : c)) },
        },
      };
    }),

  updateChar: (cueId, charId, patch) =>
    set((st) => {
      const id = st.activeShowId;
      const r = st.results[id];
      if (!r) return {};
      return {
        results: {
          ...st.results,
          [id]: {
            ...r,
            cue: r.cue.map((c) =>
              c.id === cueId
                ? { ...c, chars: c.chars.map((a) => (a.id === charId ? { ...a, ...patch } : a)) }
                : c,
            ),
          },
        },
      };
    }),

  dragBoundary: (cueId, edge, time) => {
    const st = get();
    const r = st.results[st.activeShowId];
    if (!r) return;
    const cue = r.cue.find((c) => c.id === cueId);
    if (!cue) return;
    const sorted = [...r.cue].sort((a, b) => a.start - b.start);
    const idx = sorted.findIndex((c) => c.id === cueId);
    const prev = sorted[idx - 1];
    const next = sorted[idx + 1];

    if (edge === 'start') {
      const lo = prev ? prev.end + 0.03 : 0;
      const start = clamp(time, lo, cue.end - 0.4);
      st.updateCue(cueId, { start });
    } else {
      // 拖腔硬约束：结束不得早于长拖腔字尾
      let floor = cue.start + 0.4;
      for (const ch of cue.chars) {
        if (ch.status !== 'missing' && ch.end - ch.start >= 3) floor = Math.max(floor, ch.end + 0.18);
      }
      let hi = r.duration - 0.05;
      if (next) hi = Math.min(hi, next.start - 0.03);
      // 若下一句太紧、与拖腔硬约束冲突，优先保证拖腔，允许轻微重叠
      const end = hi >= floor ? clamp(time, floor, hi) : Math.max(floor, time);
      st.updateCue(cueId, { end: Math.max(end, floor) });
    }
  },

  moveCue: (cueId, start) => {
    const st = get();
    const r = st.results[st.activeShowId];
    if (!r) return;
    const cue = r.cue.find((c) => c.id === cueId);
    if (!cue) return;
    const delta = start - cue.start;
    const dur = cue.end - cue.start;
    const maxStart = r.duration - dur;
    const ns = clamp(start, 0, maxStart);
    const d2 = ns - cue.start;
    st.updateCue(cueId, {
      start: ns,
      end: cue.end + d2,
      chars: cue.chars.map((c) => ({ ...c, start: Math.max(0, c.start + d2), end: c.end + d2 })),
    });
    void delta;
  },

  addCueForLine: (lineId, at) => {
    const st = get();
    const show = st.shows.find((s) => s.id === st.activeShowId);
    const r = st.results[st.activeShowId];
    if (!show || !r) return;
    const line = show.script.find((l) => l.id === lineId);
    if (!line) return;
    const chars = spokenChars(line.dialect);
    const dur = Math.max(1.6, chars.length * (line.kind === 'speak' ? 0.22 : 0.42));
    const start = clamp(at, 0, Math.max(0, r.duration - dur));
    const cue: Cue = {
      id: nextId('cue_'),
      lineId,
      kind: line.kind,
      role: line.role,
      start,
      end: start + dur,
      mandarin: line.mandarin,
      chars: chars.map((ch, i) => ({
        id: nextId('ac_'),
        ch,
        start: start + (i * dur) / chars.length,
        end: start + ((i + 1) * dur) / chars.length,
        status: 'matched' as const,
        lineId,
        charIndex: i,
      })),
    };
    set((s) => {
      const rr = s.results[s.activeShowId];
      return {
        results: { ...s.results, [s.activeShowId]: { ...rr, cue: [...rr.cue, cue] } },
        selectedCueId: cue.id,
        page: 'edit',
      };
    });
  },

  addCueAt: (at) => {
    const st = get();
    const r = st.results[st.activeShowId];
    if (!r) return;
    const cue: Cue = {
      id: nextId('cue_'),
      lineId: null,
      kind: 'sing',
      start: at,
      end: at + 2,
      mandarin: '',
      chars: [],
      improvised: true,
    };
    set((s) => ({
      results: { ...s.results, [s.activeShowId]: { ...r, cue: [...r.cue, cue] } },
      selectedCueId: cue.id,
    }));
  },

  deleteCue: (cueId) =>
    set((st) => {
      const id = st.activeShowId;
      const r = st.results[id];
      if (!r) return {};
      return {
        results: { ...st.results, [id]: { ...r, cue: r.cue.filter((c) => c.id !== cueId) } },
        selectedCueId: st.selectedCueId === cueId ? null : st.selectedCueId,
      };
    }),
}));

/** 选择器：当前 show */
export function useActiveShow(): Show {
  const id = useStore((s) => s.activeShowId);
  const shows = useStore((s) => s.shows);
  return shows.find((x) => x.id === id) ?? shows[0];
}

export { minimumCueEnd };
