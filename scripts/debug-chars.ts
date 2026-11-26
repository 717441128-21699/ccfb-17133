import { SAMPLE_SHOWS } from '../src/data/samples.ts';
import { renderShow } from '../src/audio/synth.ts';
import { alignAudio, debugPipeline, DEFAULT_ALIGN_OPTIONS } from '../src/alignment/engine.ts';
import { spokenChars } from '../src/utils/text.ts';

const id = process.argv[2] ?? 'maixian';
const show = SAMPLE_SHOWS.find((s) => s.id === id)!;
const { samples, sampleRate, truth } = renderShow(show);
const dbg = debugPipeline(samples, sampleRate, DEFAULT_ALIGN_OPTIONS);
const result = alignAudio(samples, sampleRate, show.script, DEFAULT_ALIGN_OPTIONS);

for (const line of show.script) {
  const cue = result.cue.find((c) => c.lineId === line.id);
  const truthEx = truth.chars.filter((c) => c.lineId === line.id && c.extra);
  const phrase = dbg.phrases.find(
    (p) => cue && p.start <= cue.start + 0.3 && p.end >= cue.start,
  );
  const n = spokenChars(line.dialect).length;
  console.log(
    `\n${line.id} n=${n} phraseSegs=${phrase?.segs.length ?? '?'} cueChars=${cue?.chars.length ?? 'NO CUE'} truthExtras=${truthEx.map((e) => `${e.ch}@${e.start.toFixed(2)}`).join(',') || '-'}`,
  );
  if (cue) {
    for (const c of cue.chars) {
      console.log(
        `   ${c.status.padEnd(7)} idx=${String(c.charIndex ?? '-').padStart(3)} ${c.ch} ${c.start.toFixed(2)}-${c.end.toFixed(2)}${c.longDrag ? ' DRAG' : ''}`,
      );
    }
  }
}
