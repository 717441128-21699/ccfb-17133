import { SAMPLE_SHOWS } from '../src/data/samples.ts';
import { renderShow } from '../src/audio/synth.ts';
import { alignAudio, debugPipeline, DEFAULT_ALIGN_OPTIONS } from '../src/alignment/engine.ts';

const id = process.argv[2] ?? 'jieshan';
const show = SAMPLE_SHOWS.find((s) => s.id === id)!;
const { samples, sampleRate, truth } = renderShow(show);

const dbg = debugPipeline(samples, sampleRate, DEFAULT_ALIGN_OPTIONS);

// 锣鼓真值区间内的帧特征
console.log('FRAME feature quantiles:');
const zcrs = dbg.frames.map((f) => f.zcr).sort((a, b) => a - b);
const hfs = dbg.frames.map((f) => f.hf).sort((a, b) => a - b);
const rms = dbg.frames.map((f) => f.rms).sort((a, b) => a - b);
const q = (a: number[], p: number) => a[Math.floor(a.length * p)].toFixed(3);
console.log(`  zcr  p50=${q(zcrs, 0.5)} p80=${q(zcrs, 0.8)} p95=${q(zcrs, 0.95)}`);
console.log(`  hf   p50=${q(hfs, 0.5)} p80=${q(hfs, 0.8)} p95=${q(hfs, 0.95)}`);
console.log(`  rms  p20=${q(rms, 0.2)} p50=${q(rms, 0.5)} p90=${q(rms, 0.9)}`);

for (const tg of truth.gaps.filter((g) => g.type === 'luogu').slice(0, 3)) {
  const ff = dbg.frames.filter((f) => f.t >= tg.start && f.t <= tg.end);
  const z = ff.map((f) => f.zcr).sort((a, b) => a - b);
  const h = ff.map((f) => f.hf).sort((a, b) => a - b);
  const noisy = ff.filter((f) => f.zcr > 0.13 && f.hf > 0.9).length;
  const hb = (thr: number) => ff.filter((f) => f.hf > thr).length;
  console.log(
    `  luogu ${tg.start.toFixed(1)}-${tg.end.toFixed(1)}: n=${ff.length} ` +
      `hf p50=${q(h, 0.5)} p75=${q(h, 0.75)} p90=${q(h, 0.9)} max=${q(h, 0.99)} ` +
      `zcrMed=${q(z, 0.5)} noisy=${(noisy / Math.max(1, ff.length)).toFixed(2)} ` +
      `hf>.5:${(hb(0.5) / ff.length).toFixed(2)} hf>.7:${(hb(0.7) / ff.length).toFixed(2)}`,
  );
}
// 对照：唱腔区间
const singTruth = truth.chars.find((c) => !c.extra);
if (singTruth) {
  const ff = dbg.frames.filter((f) => f.t >= singTruth.start && f.t <= singTruth.end + 0.3);
  const h = ff.map((f) => f.hf).sort((a, b) => a - b);
  console.log(`  sing-char ${singTruth.ch} ${singTruth.start.toFixed(1)}: hf p50=${q(h, 0.5)} p90=${q(h, 0.9)}`);
}

console.log('\nPERC detected:', dbg.perc.map((p) => `${p.start.toFixed(1)}-${p.end.toFixed(1)}`).join('  '));

console.log(`\nPHRASES (lineGap=${DEFAULT_ALIGN_OPTIONS.lineGap}), total segs=${dbg.segs.length}, phrases=${dbg.phrases.length}:`);
dbg.phrases.forEach((p, i) => {
  const longs = p.segs.map((s, k) => `${k}:${s.dur.toFixed(2)}${s.long ? 'L' : ''}`).join(' ');
  console.log(`  P${i} ${p.start.toFixed(2)}-${p.end.toFixed(2)} n=${p.segs.length} | ${longs}`);
});

const result = alignAudio(samples, sampleRate, show.script, DEFAULT_ALIGN_OPTIONS);
console.log('\nCUES:');
for (const c of result.cue) {
  const line = show.script.find((l) => l.id === c.lineId);
  console.log(
    `  ${c.start.toFixed(2)}-${c.end.toFixed(2)} line=${c.lineId ?? '即兴'} nchar=${c.chars.length} ${line?.dialect.slice(0, 14) ?? ''}`,
  );
}

console.log('\nTRUTH lines:');
for (const l of truth.lines) console.log(`  ${l.start.toFixed(2)}-${l.end.toFixed(2)} sung=${l.sung} ${l.lineId}`);
