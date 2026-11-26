/**
 * 生成三出戏的自编录音 WAV 到 public/samples/。
 * 运行：npm run gen:samples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_SHOWS } from '../src/data/samples.ts';
import { renderShow } from '../src/audio/synth.ts';
import { encodeWavPcm16 } from '../src/audio/wav.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'samples');
mkdirSync(outDir, { recursive: true });

for (const show of SAMPLE_SHOWS) {
  const { samples, sampleRate, truth } = renderShow(show);
  const wav = Buffer.from(encodeWavPcm16(samples, sampleRate));
  const file = join(outDir, `${show.id}.wav`);
  writeFileSync(file, wav);
  const mb = (wav.length / 1024 / 1024).toFixed(2);
  console.log(
    `✓ ${show.title}  ${truth.duration.toFixed(1)}s  ${mb}MB  唱字${truth.chars.filter((c) => !c.extra).length} 衬字${truth.chars.filter((c) => c.extra).length}`,
  );
}
console.log('完成。');
