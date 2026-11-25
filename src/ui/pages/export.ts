import { set, store, toast } from '../../state/store';
import { h } from '../dom';
import { ICONS } from '../icons';
import { toSrt, toVtt, toAss, toProjectJson, downloadTextFile, triggerDownload } from '../../export/formats';
import { burnToVideo, pickRecorderMime } from '../../audio/burn';
import { ensureAudioReady } from '../../audio/sampleLoader';
import { getPlay } from '../../data/plays';
import type { Cue } from '../../types';

type Format = 'srt' | 'vtt' | 'ass' | 'json';
let currentFormat: Format = 'srt';
let burnUrl: string | null = null;

export function renderExport(root: HTMLElement): void {
  if (!store.result || !store.cues.length) {
    root.append(
      h('div', { class: 'card empty-state' },
        h('h2', null, '还没有可导出的字幕'),
        h('p', null, '请先完成唱本导入与自动对齐。'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => set({ route: 'align' }) }, '去对齐'),
      ),
    );
    return;
  }
  ensureAudioReady();

  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, '导出与烧录'),
        h('p', { class: 'page-desc' }, '导出通用 SRT / WebVTT / ASS 双语字幕（CRLF、UTF-8 BOM 可选，常见播放器与剪辑软件可正确读取），或直接在浏览器里把字幕烧进视频。'),
      ),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => set({ route: 'edit' }) }, '← 返回微调'),
    ),
  );

  const preview = h('pre', { class: 'preview-box' }) as HTMLPreElement;
  const refreshPreview = () => {
    preview.textContent = buildText(currentFormat);
  };
  refreshPreview();

  /* 左：格式 + 选项 + 下载 */
  const formatList = h('div', { class: 'format-list' });
  const formats: { id: Format; ext: string; name: string; desc: string }[] = [
    { id: 'srt', ext: 'SRT', name: 'SubRip 字幕', desc: '兼容性最好，VLC / 电视 / 剪映 / PR 均可' },
    { id: 'vtt', ext: 'VTT', name: 'WebVTT', desc: '网页 HTML5 <track> 标准格式' },
    { id: 'ass', ext: 'ASS', name: 'Advanced SSA', desc: '双语样式、字体与描边，FFmpeg 烧录用' },
    { id: 'json', ext: 'JSON', name: '工程数据', desc: '含逐字时间、对齐段与全部设置' },
  ];
  for (const f of formats) {
    const card = h('button', {
      class: `format-card${currentFormat === f.id ? ' active' : ''}`,
      type: 'button',
      onclick: () => {
        currentFormat = f.id;
        formatList.querySelectorAll('.format-card').forEach((el) => el.classList.remove('active'));
        card.classList.add('active');
        refreshPreview();
      },
    },
      h('span', { class: 'format-ext' }, f.ext),
      h('span', null, h('span', { class: 'format-name' }, f.name), h('div', { class: 'format-desc' }, f.desc)),
    );
    formatList.append(card);
  }

  const bomSwitch = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const missingSwitch = h('input', {
    type: 'checkbox',
    checked: store.options.exportMissingLines,
    onChange: (e: Event) => {
      store.options.exportMissingLines = (e.target as HTMLInputElement).checked;
      refreshPreview();
    },
  }) as HTMLInputElement;
  const mandarinSwitch = h('input', {
    type: 'checkbox',
    checked: store.options.showMandarin,
    onChange: (e: Event) => {
      store.options.showMandarin = (e.target as HTMLInputElement).checked;
      refreshPreview();
    },
  }) as HTMLInputElement;

  const left = h('div', { class: 'card' },
    h('h3', null, '字幕格式'),
    formatList,
    h('div', { style: { height: '1px', background: 'var(--line)', margin: '16px 0' } }),
    h('label', { class: 'setting', style: { marginBottom: '10px', cursor: 'pointer' } },
      h('span', { class: 'switch' }, mandarinSwitch, h('span', { class: 'track' })), '包含普通话释义行'),
    h('label', { class: 'setting', style: { marginBottom: '10px', cursor: 'pointer' } },
      h('span', { class: 'switch' }, missingSwitch, h('span', { class: 'track' })), '导出标黄的漏唱估算句（默认关）'),
    currentFormat === 'srt'
      ? h('label', { class: 'setting', style: { marginBottom: '16px', cursor: 'pointer' } },
          h('span', { class: 'switch' }, bomSwitch, h('span', { class: 'track' })), 'SRT 加 UTF-8 BOM（推荐 Windows 播放器）')
      : h('div', { style: { marginBottom: '16px' } }),
    h('button', {
      class: 'btn btn-primary', style: { width: '100%' }, type: 'button',
      onclick: () => downloadCurrent(bomSwitch.checked),
    }, h('span', { html: ICONS.download }), `下载 .${currentFormat === 'json' ? 'json' : currentFormat}`),
  );

  const right = h('div', { class: 'card', style: { minWidth: '0' } },
    h('h3', null, '文件预览'),
    preview,
  );

  root.append(h('div', { class: 'export-grid' }, left, right));

  /* FFmpeg 卡片 */
  const baseName = safeName(store.playId);
  root.append(
    h('div', { class: 'card mt-18' },
      h('h3', null, '🎬 用 FFmpeg 压进 MP4（专业流程）'),
      h('p', { class: 'muted', style: { fontSize: '13.5px', marginBottom: '10px' } },
        '先下载 ASS 文件并改名为 sub.ass，与视频放在同一目录，执行：'),
      h('div', { class: 'ffmpeg-cmd' }, `ffmpeg -i "${baseName}.mp4" -vf "ass=sub.ass" -c:a copy "${baseName}_硬字幕.mp4"`),
      h('p', { class: 'help-text' }, 'ASS 内含方言 + 普通话双样式与描边，可直接被 FFmpeg / libass 渲染。'),
    ),
  );

  /* 浏览器烧录 */
  root.append(burnCard());
}

function buildText(format: Format): string {
  const opts = { subtitle: store.options, bom: false };
  if (format === 'srt') return toSrt(store.cues, opts);
  if (format === 'vtt') return toVtt(store.cues, opts);
  if (format === 'ass') return toAss(store.cues, opts);
  return toProjectJson({
    app: '影戏字幕工坊',
    version: 1,
    exportedAt: new Date().toISOString(),
    play: store.playId ? getPlay(store.playId) : null,
    script: store.script,
    options: store.options,
    result: store.result,
    cues: store.cues,
  });
}

function downloadCurrent(bom: boolean) {
  const text = buildText(currentFormat);
  const name = safeName(store.playId);
  if (currentFormat === 'json') {
    downloadTextFile(`${name}_字幕工程.json`, text, 'application/json', false);
  } else if (currentFormat === 'srt') {
    downloadTextFile(`${name}_双语字幕.srt`, text, 'text/plain', bom);
  } else if (currentFormat === 'vtt') {
    downloadTextFile(`${name}_双语字幕.vtt`, text, 'text/vtt', false);
  } else {
    downloadTextFile(`${name}_双语字幕.ass`, text, 'text/plain', true);
  }
  toast('字幕文件已导出', 'ok');
}

function safeName(id: string): string {
  const play = getPlay(id);
  return play && id !== 'custom' ? play.title : '皮影戏';
}

function burnCard(): HTMLElement {
  const mime = pickRecorderMime();
  const resSelect = h('select', { class: 'input' }) as HTMLSelectElement;
  for (const [v, label] of [['1280x720', '720p · 1280×720'], ['854x480', '480p · 854×480（较快）'], ['1920x1080', '1080p · 1920×1080']]) {
    const o = h('option', { value: v }, label) as HTMLOptionElement;
    if (v === '1280x720') o.selected = true;
    resSelect.append(o);
  }
  const limitSelect = h('select', { class: 'input' }) as HTMLSelectElement;
  for (const [v, label] of [['8', '前 8 秒快速验证'], ['30', '前 30 秒快速样片'], ['60', '前 60 秒'], ['0', '全片（实时录制）']]) {
    const o = h('option', { value: v }, label) as HTMLOptionElement;
    limitSelect.append(o);
  }

  const progWrap = h('div', { style: { display: 'none', marginTop: '14px' } });
  const progFill = h('div', { class: 'progress-fill', style: { width: '0%' } }) as HTMLElement;
  const progMsg = h('div', { class: 'progress-msg' }, '正在实时烧录…');
  progWrap.append(h('div', { class: 'progress-track' }, progFill), progMsg);

  const resultWrap = h('div', { class: 'mt-12' });

  const startBtn = h('button', { class: 'btn btn-jade', type: 'button' },
    h('span', { html: ICONS.film }), '开始烧录并录制视频');
  startBtn.addEventListener('click', async () => {
    const [w, hgt] = resSelect.value.split('x').map(Number);
    const limit = parseInt(limitSelect.value, 10);
    startBtn.disabled = true;
    progWrap.style.display = 'block';
    resultWrap.replaceChildren();
    try {
      const title = store.playId !== 'custom' ? getPlay(store.playId).title : '皮影戏';
      const { blob, ext } = await burnToVideo({
        cues: store.cues as Cue[],
        subtitle: store.options,
        width: w,
        height: hgt,
        videoUrl: store.videoUrl,
        limitSec: limit,
        title,
        onProgress: (p) => {
          progFill.style.width = `${Math.round(p * 100)}%`;
          progMsg.textContent = `正在实时烧录… ${Math.round(p * 100)}%`;
        },
      });
      if (burnUrl) URL.revokeObjectURL(burnUrl);
      burnUrl = URL.createObjectURL(blob);
      const video = h('video', { class: 'burn-canvas', controls: 'true', src: burnUrl }) as HTMLVideoElement;
      const dl = h('a', { class: 'btn btn-primary', attrs: { href: burnUrl, download: `${safeName(store.playId)}_硬字幕.${ext}` } },
        h('span', { html: ICONS.download }), `下载烧录好的 .${ext}`) as HTMLAnchorElement;
      resultWrap.append(video, h('div', { class: 'btn-row mt-12' }, dl));
      toast('烧录完成', 'ok');
    } catch (e) {
      console.error(e);
      toast(`烧录失败：${(e as Error).message}`, 'err');
    } finally {
      startBtn.disabled = false;
      progWrap.style.display = 'none';
    }
  });

  return h('div', { class: 'card mt-18' },
    h('h3', null, '🔥 直接烧进视频（浏览器实时录制）'),
    h('p', { class: 'muted', style: { fontSize: '13.5px', marginBottom: '13px' } },
      store.videoName
        ? `将把字幕烧到视频「${store.videoName}」画面上，音频来自其解码音轨。`
        : '未载入视频：将生成中式戏台背景片并铺底示例录音，适合先验证效果。也可在导入页载入自己的视频。'),
    h('div', { class: 'btn-row' },
      h('span', { class: 'setting' }, '分辨率', resSelect),
      h('span', { class: 'setting' }, '范围', limitSelect),
      startBtn,
      h('span', { class: 'muted', style: { fontSize: '12.5px' } }, `录制封装：${mime.mimeType || '浏览器默认（通常 webm/vp9+opus）'}`),
    ),
    progWrap,
    resultWrap,
  );
}
