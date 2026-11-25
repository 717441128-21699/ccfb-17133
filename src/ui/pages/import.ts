import { PLAYS } from '../../data/plays';
import type { ScriptLine } from '../../types';
import { h } from '../dom';
import { motifSvg } from '../icons';
import { set, store, toast } from '../../state/store';
import { loadSampleAudio } from '../../audio/sampleLoader';
import { player } from '../../audio/player';
import { splitScriptText } from '../../lib/text';

let textDraft = '';

export function renderImport(root: HTMLElement): void {
  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, '唱本导入'),
        h('p', { class: 'page-desc' },
          '选择一出虚构的示例皮影戏（方言唱本与演出录音均由程序编配合成），或粘贴 / 上传你自己的唱本与录音。唱本支持「唱：」「白：」标记与「方言 || 普通话」双语格式。'),
      ),
    ),
  );

  /* 剧目卡片 */
  const grid = h('div', { class: 'play-grid' });
  for (const play of PLAYS) {
    const selected = store.playId === play.id && store.script.length > 0;
    const card = h('button', {
      class: `play-card${selected ? ' selected' : ''}`,
      type: 'button',
      onclick: () => choosePlay(play.id),
    },
      h('div', { class: 'play-motif', html: motifSvg(play.motif) }),
      h('div', { class: 'play-title' }, play.title, h('span', { class: 'play-region' }, play.region)),
      h('p', { class: 'play-tagline' }, play.tagline),
      h('div', { class: 'play-roles' }, `人物：${play.roles.join('、')}`),
      h('div', { class: 'play-meta' },
        h('span', { class: 'badge badge-sing' }, `${play.lines.filter((l) => l.kind === 'sing').length} 唱段`),
        h('span', { class: 'badge badge-speak' }, `${play.lines.filter((l) => l.kind === 'speak').length} 道白`),
        h('span', { class: 'badge badge-warn' }, `漏 ${play.perf.skipLines?.length ?? 0} 句`),
        h('span', { class: 'badge badge-gray' }, `衬字 ${play.perf.adLibs?.length ?? 0}`),
        h('span', { class: 'badge badge-gold' }, `锣鼓 ${play.perf.percussions?.length ?? 0}`),
      ),
    );
    grid.append(card);
  }
  root.append(grid);

  /* 导入区 + 预览 */
  const textarea = h('textarea', {
    class: 'textarea',
    placeholder:
      '每行一句，可用前缀标记唱腔/道白，|| 后写普通话意思，例如：\n【唱】太阳上来红彤彤 || 太阳升起满天红\n【白】天气不早咧，牲口快些走！ || 天不早了，牲口快点走！',
    onInput: (e: Event) => {
      textDraft = (e.target as HTMLTextAreaElement).value;
    },
  }) as HTMLTextAreaElement;
  textarea.value = textDraft;

  const parseBtn = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    onclick: () => {
      const rows = splitScriptText(textDraft);
      if (!rows.length) {
        toast('没有解析到有效唱词，请检查格式', 'err');
        return;
      }
      const lines: ScriptLine[] = rows.map((r, i) => ({ id: `custom-${i + 1}`, ...r }));
      set({
        script: lines,
        playId: 'custom',
        scriptSourceName: '粘贴文本',
        cues: [],
        result: null,
        alignStatus: 'idle',
        selectedCueId: null,
      });
      toast(`已解析 ${lines.length} 句唱本`, 'ok');
      renderPreview(previewCard);
    },
  }, '解析唱本');

  const txtFile = h('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', style: { display: 'none' } }) as HTMLInputElement;
  txtFile.addEventListener('change', () => {
    const f = txtFile.files?.[0];
    if (f) readScriptFile(f, textarea);
    txtFile.value = '';
  });

  const audioFile = h('input', { type: 'file', accept: 'audio/*,video/*', style: { display: 'none' } }) as HTMLInputElement;
  audioFile.addEventListener('change', () => {
    const f = audioFile.files?.[0];
    if (f) void loadAudioFile(f);
    audioFile.value = '';
  });

  const videoFile = h('input', { type: 'file', accept: 'video/*', style: { display: 'none' } }) as HTMLInputElement;
  videoFile.addEventListener('change', () => {
    const f = videoFile.files?.[0];
    if (f) {
      if (store.videoUrl) URL.revokeObjectURL(store.videoUrl);
      set({ videoUrl: URL.createObjectURL(f), videoName: f.name });
      toast('视频已载入，可在导出页烧录字幕', 'ok');
    }
    videoFile.value = '';
  });

  const leftCard = h('div', { class: 'card' },
    h('h3', null, '📥 导入自己的材料'),
    h('div', { class: 'btn-row', style: { marginBottom: '12px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => txtFile.click() }, '选择唱本文件 .txt/.json'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => fillSampleTemplate(textarea) }, '填入格式模板'),
    ),
    textarea,
    h('div', { class: 'btn-row mt-12' }, parseBtn),
    h('p', { class: 'help-text' }, '支持 UTF-8 文本；JSON 可为 { "lines": [...] } 或本工坊导出的工程文件。'),
    h('div', { style: { height: '1px', background: 'var(--line)', margin: '18px 0' } }),
    h('h3', null, '🎵 演出录音 / 视频'),
    h('div', {
      class: 'dropzone',
      tabindex: '0',
      onclick: () => audioFile.click(),
      onDragover: (e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add('drag');
      },
      onDragleave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('drag'),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove('drag');
        const f = e.dataTransfer?.files?.[0];
        if (f) void loadAudioFile(f);
      },
    },
      h('span', { class: 'dz-icon' }, '🎧'),
      h('div', null, h('b', null, '点击选择或拖入录音/视频文件')),
      h('div', { class: 'help-text', style: { marginTop: '4px' } }, 'MP3 / WAV / M4A / OGG / MP4 等浏览器可解码格式；音频仅在本机处理，不上传。'),
    ),
    h('div', { class: 'btn-row mt-12' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => videoFile.click() }, '🎬 仅载入视频（用于烧录）'),
      store.videoName ? h('span', { class: 'badge badge-indigo' }, `视频：${store.videoName}`) : null,
    ),
    txtFile, audioFile, videoFile,
    audioChip(),
  );

  const previewCard = h('div', { class: 'card' });
  renderPreview(previewCard);

  root.append(h('div', { class: 'grid-2 mt-18' }, leftCard, previewCard));

  /* 底部操作 */
  const canNext = store.script.length > 0 && !!player.buffer;
  root.append(
    h('div', { class: 'card mt-18', style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
      h('div', { class: 'flex-1' },
        h('b', { style: { fontSize: '16px' } }, canNext ? '材料就绪' : '还需要唱本和录音'),
        h('div', { class: 'muted', style: { fontSize: '13.5px' } },
          `唱本 ${store.script.length} 句 · 录音：${store.audioName || '未载入'} · 时长 ${store.audioDuration ? store.audioDuration.toFixed(1) + 's' : '—'}`),
      ),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        disabled: !canNext,
        onclick: () => set({ route: 'align' }),
      }, '下一步：录音对齐 →'),
    ),
  );
}

function audioChip(): HTMLElement {
  if (!store.audioName) return h('div');
  return h('div', { class: 'audio-chip' },
    h('span', { class: 'eq' }, h('i'), h('i'), h('i'), h('i')),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div', { style: { fontWeight: '700' } }, store.audioName),
      h('div', { style: { fontSize: '12px', opacity: '0.75' } },
        `${store.audioIsSample ? '程序合成的示例演出录音 · ' : ''}${store.audioDuration.toFixed(1)} 秒 · Web Audio 可试听`),
    ),
    h('button', {
      class: 'btn btn-gold btn-sm',
      type: 'button',
      onclick: () => {
        if (player.playing) player.pause();
        else player.play();
      },
    }, '试听'),
  );
}

function choosePlay(playId: string) {
  const play = PLAYS.find((p) => p.id === playId)!;
  loadSampleAudio(playId);
  set({
    playId,
    script: play.lines,
    scriptSourceName: `示例剧目·${play.title}`,
    audioName: `《${play.title}》合成演出录音.wav`,
    audioIsSample: true,
    cues: [],
    result: null,
    alignStatus: 'idle',
    alignError: '',
    selectedCueId: null,
  });
  toast(`已载入《${play.title}》唱本与合成录音`, 'ok');
  // 重新渲染本页以更新选中态/预览/底部按钮
  const root = document.getElementById('page')!;
  root.replaceChildren();
  renderImport(root);
}

function renderPreview(card: HTMLElement) {
  card.replaceChildren();
  card.append(h('h3', null, `📖 唱本预览（${store.script.length} 句）`));
  if (!store.script.length) {
    card.append(h('p', { class: 'muted' }, '尚未载入唱本。选择上方示例戏，或粘贴文本后点击“解析唱本”。'));
    return;
  }
  const box = h('div', { class: 'script-preview' });
  store.script.forEach((line, i) => {
    box.append(
      h('div', { class: 'script-row' },
        h('div', { class: 'script-idx' }, String(i + 1).padStart(2, '0')),
        h('div', null,
          h('span', { class: `badge ${line.kind === 'sing' ? 'badge-sing' : 'badge-speak'}` }, line.kind === 'sing' ? '唱' : '白'),
          line.role ? h('div', { class: 'script-role mt-0' }, line.role) : null,
        ),
        h('div', null,
          h('div', { class: 'script-dialect' }, line.dialect),
          h('div', { class: 'script-mandarin' }, line.mandarin || '（暂无普通话释义）'),
        ),
      ),
    );
  });
  card.append(box);
}

function fillSampleTemplate(ta: HTMLTextAreaElement) {
  ta.value =
    '【唱】正月里来是新春 || 正月里春风吹来新年\n【白】你走那么快做啥哩？ || 你走那么快干什么呀？\n【唱】锣鼓敲得震天响 || 锣鼓声大得像震动了天';
  textDraft = ta.value;
  ta.focus();
}

async function readScriptFile(file: File, textarea: HTMLTextAreaElement) {
  const text = await file.text();
  if (file.name.endsWith('.json')) {
    try {
      const data = JSON.parse(text);
      const lines: ScriptLine[] = (data.script ?? data.lines ?? []).map(
        (l: ScriptLine, i: number) => ({ id: l.id ?? `imp-${i}`, kind: l.kind ?? 'sing', dialect: l.dialect, mandarin: l.mandarin ?? '', role: l.role }),
      );
      if (!lines.length) throw new Error('no lines');
      set({ script: lines, playId: 'custom', scriptSourceName: file.name, cues: [], result: null, alignStatus: 'idle' });
      toast(`从 JSON 工程载入 ${lines.length} 句`, 'ok');
      const root = document.getElementById('page')!;
      root.replaceChildren();
      renderImport(root);
      return;
    } catch {
      toast('JSON 格式无法识别，已按纯文本处理', 'err');
    }
  }
  textarea.value = text;
  textDraft = text;
  const rows = splitScriptText(text);
  if (rows.length) {
    set({
      script: rows.map((r, i) => ({ id: `file-${i + 1}`, ...r })),
      playId: 'custom',
      scriptSourceName: file.name,
      cues: [],
      result: null,
      alignStatus: 'idle',
    });
    toast(`已解析 ${rows.length} 句`, 'ok');
    const root = document.getElementById('page')!;
    root.replaceChildren();
    renderImport(root);
  }
}

async function loadAudioFile(file: File) {
  try {
    toast('正在解码音频…');
    const buf = await player.ensureContext().decodeAudioData(await file.arrayBuffer());
    player.setBuffer(buf);
    if (store.videoUrl) URL.revokeObjectURL(store.videoUrl);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
    set({
      audioName: file.name,
      audioIsSample: false,
      audioDuration: buf.duration,
      videoUrl: isVideo ? URL.createObjectURL(file) : store.videoUrl,
      videoName: isVideo ? file.name : store.videoName,
      cues: [],
      result: null,
      alignStatus: 'idle',
    });
    toast(`音频解码成功，时长 ${buf.duration.toFixed(1)}s`, 'ok');
    const root = document.getElementById('page')!;
    root.replaceChildren();
    renderImport(root);
  } catch (e) {
    toast(`音频解码失败：${(e as Error).message}`, 'err');
  }
}
