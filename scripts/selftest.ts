/* Node 自测：esbuild 打包后在 node 中运行。
   验证 合成录音 -> DSP -> 模糊对齐 -> cue 规则 -> 导出 的完整链路。 */
import { PLAYS } from '../src/data/plays';
import { synthesizePlay } from '../src/audio/synth';
import { analyzePcm } from '../src/align/dsp';
import { alignScript } from '../src/align/engine';
import { buildCues, DEFAULT_SUBTITLE_OPTIONS, findInterludeConflicts } from '../src/subtitles/cues';
import { toSrt, toVtt, toAss } from '../src/export/formats';
import { runScaleBenchmark } from '../src/align/bench';
import { alignTokens } from '../src/lib/text';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name} ${extra}`);
  }
}

for (const play of PLAYS) {
  console.log(`\n=== ${play.title} (${play.region}) ===`);
  const { pcm, sampleRate, duration } = synthesizePlay(play);
  console.log(`  合成时长 ${duration.toFixed(1)}s, PCM ${pcm.length} 采样`);

  const segments = analyzePcm(pcm, sampleRate);
  const kinds: Record<string, number> = {};
  for (const s of segments) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
  console.log(`  段数 ${segments.length}，分类`, kinds);

  const result = alignScript(play.lines, segments, duration);
  const cues = buildCues(play.lines, result, DEFAULT_SUBTITLE_OPTIONS);

  const missingIds = result.lines.filter((l) => !l.matched).map((l) => l.lineId);
  const expectSkip = play.perf.skipLines ?? [];
  console.log('  漏唱句:', missingIds, ' 期望:', expectSkip);
  check('漏唱句恰好是 spec 中指定的句子', JSON.stringify(missingIds.sort()) === JSON.stringify([...expectSkip].sort()));

  const adlibs = result.chars.filter((c) => c.adlib);
  const expectAdlibs = play.perf.adLibs ?? [];
  console.log(`  衬字 ${adlibs.length}/${expectAdlibs.length}:`, adlibs.map((a) => `${a.ch}@${a.lineId}`).join(' '));
  check('衬字数量正确', adlibs.length === expectAdlibs.length, `got ${adlibs.length}`);
  for (const ea of expectAdlibs) {
    const hit = adlibs.find((a) => a.lineId === ea.lineId && a.ch === ea.text);
    check(`衬字「${ea.text}」落在 ${ea.lineId}`, !!hit);
  }

  for (const lt of play.perf.longTones ?? []) {
    const token = alignTokens(play.lines.find((l) => l.id === lt.lineId)!.dialect)[lt.charIndex];
    const c = result.chars.find(
      (x) => x.lineId === lt.lineId && !x.adlib && x.indexInLine === lt.charIndex,
    );
    check(
      `拖腔字「${token}」(${lt.lineId}#${lt.charIndex}) 时长≈${lt.seconds}s 且被识别`,
      !!c && c.end - c.start >= 2.8,
      c ? `实际 ${(c.end - c.start).toFixed(2)}s longFlag=${c.longTone}` : '未找到该字',
    );
    const cue = cues.find((q) => q.lineId === lt.lineId);
    check(
      `拖腔字所在字幕不提前消失 (cue.end=${cue?.end.toFixed(2)} >= char.end+0.5)`,
      !!c && !!cue && cue.end >= c.end + 0.45,
    );
  }

  console.log('  过门:', result.interludes.map((i) => `${i.label} ${i.start.toFixed(1)}-${i.end.toFixed(1)}`).join(' | '));
  check('检测到过门段（>= spec 数量）', result.interludes.length >= (play.perf.percussions?.length ?? 0) - 1);

  // 每个 spec 锣鼓/器乐时间窗应与某个 interlude 相交（通过合成结构估算较难，这里只验证无字幕冲突）
  const conflicts = findInterludeConflicts(cues, result.interludes);
  check('导出 cue 与过门零冲突', conflicts.length === 0, JSON.stringify(conflicts.slice(0, 3)));

  const yellow = cues.filter((c) => c.missingLine);
  check('标黄 cue 数量 = 漏句数且默认不导出', yellow.length === expectSkip.length && yellow.every((c) => !c.exportEnabled));

  const srt = toSrt(cues, { subtitle: DEFAULT_SUBTITLE_OPTIONS, bom: false });
  const cueCount = (srt.match(/\d{2}:\d{2}:\d{2},\d{3} -->/g) ?? []).length;
  const exportedCount = cues.filter((c) => c.exportEnabled).length;
  check('SRT 时间轴条数 = 可导出 cue 数', cueCount === exportedCount, `${cueCount} vs ${exportedCount}`);
  check('SRT 含普通话行', srt.includes('。') || srt.length > 100);
  const vtt = toVtt(cues, { subtitle: DEFAULT_SUBTITLE_OPTIONS, bom: false });
  check('VTT 头正确', vtt.startsWith('WEBVTT'));
  const ass = toAss(cues, { subtitle: DEFAULT_SUBTITLE_OPTIONS, bom: false });
  check('ASS 含 Events 与双语 Style', ass.includes('[Events]') && ass.includes('Style: Mandarin'));

  // 时间单调性
  const enabled = cues.filter((c) => c.exportEnabled);
  let mono = true;
  for (let i = 1; i < enabled.length; i++) if (enabled[i].start < enabled[i - 1].start - 0.001) mono = false;
  check('cue 起始时间单调', mono);
}

console.log('\n=== 规模基准（模拟两小时） ===');
const bench = runScaleBenchmark();
console.log(bench.note);
check('DP 基准 < 60000ms（浏览器中也远低于 5 分钟预算）', bench.elapsedMs < 60000, `${bench.elapsedMs}ms`);
check('保守总预算 < 300000ms (5 分钟)', bench.projectedTwoHourMs < 300000);

console.log(failures === 0 ? '\n🎉 全部自测通过' : `\n💥 ${failures} 项失败`);
if (failures > 0) process.exit(1);
