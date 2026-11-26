/**
 * 用合成器自带的真值时间轴检验对齐引擎：
 * 漏句识别、衬字数量、字边界误差、长拖腔保持、锣鼓区间。
 * 运行：npm run verify:align
 */
import { SAMPLE_SHOWS } from '../src/data/samples.ts';
import { renderShow } from '../src/audio/synth.ts';
import { alignAudio, DEFAULT_ALIGN_OPTIONS } from '../src/alignment/engine.ts';
import { LONG_DRAG_SECONDS } from '../src/types/domain.ts';

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error('  ✗ ' + msg);
};

for (const show of SAMPLE_SHOWS) {
  console.log(`\n=== ${show.title} (${show.id}) ===`);
  const { samples, sampleRate, truth } = renderShow(show);
  const result = alignAudio(samples, sampleRate, show.script, DEFAULT_ALIGN_OPTIONS);

  const truthMissing = truth.lines.filter((l) => !l.sung).map((l) => l.lineId);
  const detectedMissing = show.script
    .filter((l) => !result.cue.some((c) => c.lineId === l.id))
    .map((l) => l.id);

  console.log(
    `  时长 ${result.duration.toFixed(1)}s 引擎耗时 ${result.stats.engineMs}ms 音节 ${result.stats.detectedSegments} cue ${result.cue.length} 漏句 ${result.stats.missingLines} 衬字 ${result.stats.extraChars}`,
  );

  for (const id of truthMissing) {
    if (!detectedMissing.includes(id)) fail(`漏句未被识别为缺失: ${id}`);
    else console.log(`  ✓ 漏句标黄: ${id}`);
  }
  for (const line of truth.lines.filter((l) => l.sung)) {
    if (!result.cue.some((c) => c.lineId === line.lineId)) fail(`应演唱的句子丢失 cue: ${line.lineId}`);
  }

  // 字边界误差
  let errSum = 0;
  let errN = 0;
  let errMax = 0;
  for (const tc of truth.chars.filter((c) => !c.extra)) {
    const cue = result.cue.find((c) => c.lineId === tc.lineId);
    const ac = cue?.chars.find((c) => c.charIndex === tc.charIndex && c.status === 'matched');
    if (!ac) {
      fail(`正字未对齐: ${tc.lineId}#${tc.charIndex} ${tc.ch}`);
      continue;
    }
    const es = Math.abs(ac.start - tc.start);
    const ee = Math.abs(ac.end - tc.end);
    const e = (es + ee) / 2;
    errSum += e;
    errN++;
    errMax = Math.max(errMax, e);
  }
  if (errN) {
    const mae = errSum / errN;
    console.log(`  字边界 MAE ${(mae * 1000).toFixed(0)}ms 最大 ${(errMax * 1000).toFixed(0)}ms (${errN} 字)`);
    if (mae > 0.22) fail(`平均字边界误差过大: ${mae.toFixed(3)}s`);
    if (errMax > 0.7) fail(`最大字边界误差过大: ${errMax.toFixed(3)}s`);
  }

  // 衬字数量（允许 ±1，因为个别短音可能漏检/多检）
  const truthExtras = truth.chars.filter((c) => c.extra).length;
  const detExtras = result.stats.extraChars;
  console.log(`  衬字 真值 ${truthExtras} / 检出 ${detExtras}`);
  if (Math.abs(detExtras - truthExtras) > 1) fail(`衬字数量偏差过大: truth=${truthExtras} detected=${detExtras}`);

  // 长拖腔：cue 结束不得早于拖腔字结束
  for (const tc of truth.chars.filter((c) => !c.extra && c.end - c.start >= LONG_DRAG_SECONDS)) {
    const cue = result.cue.find((c) => c.lineId === tc.lineId);
    if (!cue) continue;
    if (cue.end + 0.05 < tc.end) fail(`拖腔 ${tc.ch} 所在字幕提前消失 cue.end=${cue.end.toFixed(2)} < char.end=${tc.end.toFixed(2)}`);
    else console.log(`  ✓ 拖腔 ${tc.ch} ${(tc.end - tc.start).toFixed(1)}s 字幕保持至 ${cue.end.toFixed(2)}s`);
  }

  // 锣鼓区间覆盖
  const truthLuogu = truth.gaps.filter((g) => g.type === 'luogu');
  for (const tg of truthLuogu) {
    const hit = result.gaps.find(
      (g) => g.type === 'luogu' && g.start < tg.end - 0.3 && g.end > tg.start + 0.3,
    );
    if (!hit) fail(`锣鼓段未检出: ${tg.start.toFixed(1)}-${tg.end.toFixed(1)}`);
  }
  if (truthLuogu.length) console.log(`  ✓ 锣鼓段 ${truthLuogu.length} 处，检出 gap 共 ${result.gaps.length} 段`);

  // cue 不得与 luogu gap 显著重叠
  for (const cue of result.cue) {
    for (const g of result.gaps.filter((g) => g.type === 'luogu')) {
      const ov = Math.min(cue.end, g.end) - Math.max(cue.start, g.start);
      if (ov > 0.25) fail(`字幕与锣鼓区间重叠 ${ov.toFixed(2)}s: cue ${cue.id}`);
    }
  }
}

console.log(`\n${failures === 0 ? '✅ 全部校验通过' : `❌ ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
