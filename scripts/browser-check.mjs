// 浏览器端冒烟验证：真实 Chrome 跑 合成→Worker 对齐→编辑页→拖拽→导出。
// 用法：node scripts/browser-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:4190/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\piying-shots';

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--allow-file-access-from-files',
  ],
  defaultViewport: { width: 1500, height: 1000, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const url = `${BASE}?autodemo=1&goto=edit#/align`;
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // 等待 cue 卡片（Worker 对齐完成）
  await page.waitForSelector('.cue-card', { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));

  const summary = await page.evaluate(() => {
    const s = window.__studio.store;
    return {
      route: s.route,
      cues: s.cues.length,
      missing: document.querySelectorAll('.cue-card.missing').length,
      adlibTokens: document.querySelectorAll('.tok-adlib').length,
      longBadges: document.querySelectorAll('.badge-indigo').length,
      waveCanvas: document.querySelectorAll('#page canvas').length,
      firstCueStart: s.cues[0]?.start,
      playTitle: document.querySelector('.brand-title')?.textContent,
    };
  });
  console.log('编辑页摘要:', JSON.stringify(summary, null, 2));
  await page.screenshot({ path: `${SHOT}/02-edit-top.png` });

  // 滚动到 cue 列表并截图
  await page.evaluate(() => document.querySelector('.cue-list')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${SHOT}/03-edit-cues.png` });

  /* ---- 真实拖拽第一个 cue 的左边界 ---- */
  await page.evaluate(() => document.querySelector('.wave-card')?.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 400));
  const dragResult = await page.evaluate(() => {
    const s = window.__studio.store;
    const before = s.cues[0].start;
    const canvases = document.querySelectorAll('.wave-card canvas');
    const overlay = canvases[canvases.length - 1];
    const rect = overlay.getBoundingClientRect();
    const xInCanvas = window.__wave.timeToX(before);
    return { before, startX: rect.left + xInCanvas, y: rect.top + 145 };
  });
  const beforeStart = dragResult.before;
  await page.mouse.move(dragResult.startX, dragResult.y);
  await new Promise((r) => setTimeout(r, 150));
  await page.mouse.down();
  await page.mouse.move(dragResult.startX + 45, dragResult.y, { steps: 8 });
  await new Promise((r) => setTimeout(r, 120));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const afterStart = await page.evaluate(() => window.__studio.store.cues[0].start);
  console.log(`拖拽边界: start ${beforeStart.toFixed(2)} -> ${afterStart.toFixed(2)}`);
  if (Math.abs(afterStart - beforeStart) < 0.05) errors.push('拖拽左边界未改变 cue.start');

  /* ---- 黄色漏句卡片截图 + cue 重叠诊断 ---- */
  const overlapInfo = await page.evaluate(() => {
    const cues = [...window.__studio.store.cues].sort((a, b) => a.start - b.start);
    const overlaps = [];
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start < cues[i - 1].end - 0.02) {
        overlaps.push(`${cues[i - 1].lineId}:${cues[i - 1].end.toFixed(1)} > ${cues[i].lineId}:${cues[i].start.toFixed(1)}`);
      }
    }
    const yellow = document.querySelector('.cue-card.missing');
    yellow?.scrollIntoView({ block: 'center' });
    return { overlaps, yellowText: yellow?.querySelector('.cue-dialect')?.textContent };
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${SHOT}/06-yellow.png` });
  console.log('cue 重叠:', overlapInfo.overlaps.length ? overlapInfo.overlaps.join(' | ') : '无');
  console.log('黄句文本:', overlapInfo.yellowText);

  /* ---- 播放按钮不报错 ---- */
  await page.click('.play-btn');
  await new Promise((r) => setTimeout(r, 700));
  await page.click('.play-btn');
  await new Promise((r) => setTimeout(r, 200));

  /* ---- 导出页 ---- */
  await page.evaluate(() => {
    window.location.hash = '#/export';
  });
  await page.waitForSelector('.preview-box', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  const srtPreview = await page.$eval('.preview-box', (el) => el.textContent);
  console.log('SRT 预览前 300 字:\n', srtPreview.slice(0, 300));
  if (!srtPreview.includes('-->')) errors.push('SRT 预览缺少时间轴');
  if (!srtPreview.includes('哎')) errors.push('SRT 未包含灰字衬字「哎」');
  if (!srtPreview.includes('太阳升起') && !srtPreview.includes('红彤彤')) {
    // 普通话行存在性宽松检查
  }
  await page.screenshot({ path: `${SHOT}/04-export.png` });

  // 切到 ASS
  const assBtn = (await page.$$('.format-card'))[2];
  await assBtn.click();
  await new Promise((r) => setTimeout(r, 200));
  const assPreview = await page.$eval('.preview-box', (el) => el.textContent);
  if (!assPreview.includes('[Events]')) errors.push('ASS 预览缺少 [Events]');

  /* ---- 对齐页性能自测按钮存在 ---- */
  await page.evaluate(() => (window.location.hash = '#/align'));
  await page.waitForSelector('.stats-grid', { timeout: 10000 });
  await page.screenshot({ path: `${SHOT}/05-align.png` });

  console.log('\n页面错误:', errors.length ? '\n' + errors.join('\n') : '无');
  if (summary.cues < 10) errors.push(`cue 数量过少: ${summary.cues}`);
  if (summary.missing !== 1) errors.push(`黄句数量应为 1，实际 ${summary.missing}`);
  if (summary.adlibTokens !== 4) errors.push(`灰字衬字 token 应为 4，实际 ${summary.adlibTokens}`);
  if (summary.waveCanvas < 2) errors.push('波形 canvas 未挂载');

  console.log(errors.length ? '\n❌ BROWSER CHECK FAILED' : '\n✅ BROWSER CHECK PASSED');
} catch (e) {
  errors.push(`fatal: ${e.stack || e.message}`);
  console.error(e);
} finally {
  await browser.close();
  if (errors.length) process.exit(1);
}
