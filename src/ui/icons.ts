// 线性/皮影风格 SVG 图标字符串
export const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  wave: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#f3d98b" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h2l2-7 3 14 3-11 2 6 2-2h4"/></svg>',
  worker: '<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="#f3d98b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/><circle cx="12" cy="12" r="3.2"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.6v.1"/></svg>',
  ghost: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg>',
  tone: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12c2 0 2-6 4-6s2 12 4 12 2-6 4-6 2 3 4 3"/></svg>',
  drum: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="8" rx="8" ry="4"/><path d="M4 8v8c0 2.2 3.6 4 8 4s8-1.8 8-4V8"/><path d="m17 3-3 4M7 3l3 4"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16"/></svg>',
  film: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
};

// 剧目卡片上的皮影母题（简洁线性 SVG，currentColor 金色）
export function motifSvg(motif: string): string {
  const common = 'fill="none" stroke="#f6dd9a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  switch (motif) {
    case 'donkey':
      return `<svg viewBox="0 0 48 48" ${common}>
        <path d="M14 34c-3-1-5-4-4-8l2-7-3-6 6 3c2-1 4-1.5 6-1.5 6 0 11 4 12 10l3 2-2 3-2-1c-1 3-3 5-6 6l1 6h-4l-1-5h-8l-1 5H9l1-7c1 0 2 0 4 0Z"/>
        <circle cx="20" cy="17" r="1.3" fill="#f6dd9a"/>
        <path d="M19 12l-1-5M23 12l2-5M17 34l-1 5M27 34l1 5"/>
      </svg>`;
    case 'lotus':
      return `<svg viewBox="0 0 48 48" ${common}>
        <path d="M24 38c-8 0-14-5-15-12 5 0 9 2 12 5-1-7 0-14 3-19 3 5 4 12 3 19 3-3 7-5 12-5-1 7-7 12-15 12Z"/>
        <path d="M10 40h28M18 43h12"/>
      </svg>`;
    case 'mask':
      return `<svg viewBox="0 0 48 48" ${common}>
        <path d="M24 6c-9 0-15 6-15 15 0 11 7 21 15 21s15-10 15-21C39 12 33 6 24 6Z"/>
        <path d="M15 20c2-2 5-2 7 0M26 20c2-2 5-2 7 0"/>
        <circle cx="18.5" cy="22" r="1.6" fill="#f6dd9a"/>
        <circle cx="29.5" cy="22" r="1.6" fill="#f6dd9a"/>
        <path d="M18 31c3 2.5 9 2.5 12 0M24 8v4"/>
      </svg>`;
    default:
      return ICONS.wave;
  }
}
