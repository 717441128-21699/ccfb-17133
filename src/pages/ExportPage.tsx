import { useMemo, useState } from 'react';
import { useStore } from '../store';
import {
  downloadTextFile,
  exportASS,
  exportJSON,
  exportSRT,
  exportVTT,
  type ExportOptions,
} from '../utils/subtitles';
import { BurnInPanel } from '../components/BurnInPanel';
import { toast } from '../toast';

type Format = 'srt' | 'vtt' | 'ass' | 'json';

const FORMATS: { id: Format; ext: string; name: string; desc: string }[] = [
  { id: 'srt', ext: '.srt', name: 'SubRip SRT', desc: '兼容性最好，VLC / PotPlayer / 电视 / 剪映 / PR 均可读取，带 UTF-8 BOM 防中文乱码。' },
  { id: 'vtt', ext: '.vtt', name: 'WebVTT', desc: '网页 <track> 与现代浏览器首选，支持普通话行配色。' },
  { id: 'ass', ext: '.ass', name: 'ASS/SSA 样式字幕', desc: '可定义方言大字与普通话小字两套样式，动画/压制常用，libass 播放器效果最佳。' },
  { id: 'json', ext: '.json', name: 'JSON 时间轴', desc: '导出逐字时间、衬字与过门数据，便于二次加工或入库。' },
];

export function ExportPage() {
  const show = useStore((s) => s.shows.find((x) => x.id === s.activeShowId) ?? s.shows[0]);
  const result = useStore((s) => s.results[show.id]);
  const maxChars = useStore((s) => s.maxChars);
  const bilingual = useStore((s) => s.bilingual);
  const setPage = useStore((s) => s.setPage);

  const [format, setFormat] = useState<Format>('srt');
  const [useBom, setUseBom] = useState(true);

  const opts: ExportOptions = useMemo(
    () => ({ maxChars, bilingual, bom: useBom }),
    [maxChars, bilingual, useBom],
  );

  const content = useMemo(() => {
    if (!result) return '';
    switch (format) {
      case 'srt':
        return exportSRT(result, show.script, { ...opts, bom: false });
      case 'vtt':
        return exportVTT(result, show.script, { ...opts, bom: false });
      case 'ass':
        return exportASS(result, show.script, opts);
      case 'json':
        return exportJSON(result, show.script);
    }
  }, [format, result, show.script, opts]);

  if (!result) {
    return (
      <div className="card">
        <div className="empty">
          <span className="big">📦</span>
          <h2 style={{ justifyContent: 'center' }}>还没有可导出的字幕</h2>
          <p>请先完成自动对齐。</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 12 }} onClick={() => setPage('align')}>
            前往对齐 →
          </button>
        </div>
      </div>
    );
  }

  const doDownload = () => {
    const f = FORMATS.find((x) => x.id === format)!;
    let text = content;
    let mime = 'text/plain';
    if (format === 'srt' && useBom) text = '﻿' + text;
    if (format === 'json') mime = 'application/json';
    if (format === 'vtt') mime = 'text/vtt';
    downloadTextFile(`${show.title}-双语字幕${f.ext}`, text, mime);
    toast(`已导出 ${f.ext} 文件`);
  };

  const downloadAll = () => {
    (['srt', 'vtt', 'ass'] as Format[]).forEach((fmt, i) => {
      setTimeout(() => {
        if (fmt === 'srt') downloadTextFile(`${show.title}-双语字幕.srt`, exportSRT(result, show.script, opts), 'text/plain');
        if (fmt === 'vtt') downloadTextFile(`${show.title}-双语字幕.vtt`, exportVTT(result, show.script, opts), 'text/vtt');
        if (fmt === 'ass') downloadTextFile(`${show.title}-双语字幕.ass`, exportASS(result, show.script, opts), 'text/plain');
      }, i * 350);
    });
    toast('开始下载 SRT / VTT / ASS 三种字幕');
  };

  return (
    <div>
      <div className="page-head">
        <h1>📦 导出与烧录</h1>
        <p>按每行 {maxChars} 字自动断行，方言行下附普通话释义；漏唱的黄句不会导出，锣鼓/器乐段没有字幕。可下载通用字幕，也可直接在浏览器里把硬字幕烧进视频。</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>字幕文件</h2>
        <div className="format-grid">
          {FORMATS.map((f) => (
            <button key={f.id} className={`format-card ${format === f.id ? 'active' : ''}`} onClick={() => setFormat(f.id)}>
              <div className="ext">{f.ext}</div>
              <h3>{f.name}</h3>
              <p>{f.desc}</p>
            </button>
          ))}
        </div>

        <div className="row" style={{ margin: '18px 0 12px' }}>
          <label className="switch-row" onClick={() => useStore.getState().setBilingual(!bilingual)}>
            <span className={`switch ${bilingual ? 'on' : ''}`} />
            含普通话释义行
          </label>
          <span className="hint">每行上限 {maxChars} 字（可在编辑页调整）</span>
          {format === 'srt' && (
            <label className="switch-row" onClick={() => setUseBom(!useBom)}>
              <span className={`switch ${useBom ? 'on' : ''}`} />
              UTF-8 BOM（防 Windows 老播放器乱码）
            </label>
          )}
          <div className="spacer" />
          <button className="btn" onClick={downloadAll}>
            ⬇ 一次下载 SRT+VTT+ASS
          </button>
          <button className="btn btn-primary btn-lg" onClick={doDownload}>
            ⬇ 下载当前格式
          </button>
        </div>

        <pre className="preview-code">{content.slice(0, 6000)}</pre>
        {content.length > 6000 && <div className="hint" style={{ marginTop: 6 }}>预览仅显示前 6000 字符，完整内容以下载文件为准。</div>}
      </div>

      <BurnInPanel show={show} result={result} />
    </div>
  );
}
