// 验证浏览器内烧录（MediaRecorder）与两小时规模 Worker 基准。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const dlDir = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\piying-downloads';
fs.mkdirSync(dlDir, { recursive: true });

const BASE = process.argv[2] || 'http://127.0.0.1:4190/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\piying-shots';
const errors = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
  defaultViewport: { width: 1500, height: 1000 },
});

try {
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${BASE}?autodemo=1#/align`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.stats-grid', { timeout: 90000 });
  console.log('对齐完成，进入导出页');

  /* ---- 烧录 8s 样片 ---- */
  await page.evaluate(() => (window.location.hash = '#/export'));
  await page.waitForSelector('.burn-canvas, .card .btn-jade', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  // 选 480p 加快
  await page.evaluate(() => {
    const selects = document.querySelectorAll('.card select');
    const res = selects[0];
    res.value = '854x480';
    res.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('.btn-jade');
  console.log('已点击烧录，等待产物 <video>…');
  await page.waitForSelector('video.burn-canvas', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  const burnInfo = await page.evaluate(() => {
    const v = document.querySelector('video.burn-canvas');
    const a = document.querySelector('a[download*="硬字幕"]');
    return { w: v?.videoWidth, h: v?.videoHeight, src: !!v?.src, download: a?.getAttribute('download') };
  });
  console.log('烧录产物:', JSON.stringify(burnInfo));
  if (burnInfo.w !== 854) errors.push(`烧录分辨率异常 ${burnInfo.w}x${burnInfo.h}`);

  // 录制到第一句字幕时段，直接从实时 canvas 导出一帧验证硬字幕
  await page.waitForFunction(() => !!window.__burnCanvas, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  const dataUrl = await page.evaluate(() => window.__burnCanvas.toDataURL('image/png'));
  fs.writeFileSync(`${SHOT}/09-burn-frame.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('已保存烧录画布帧 09-burn-frame.png');

  // 产物 video 再尝试跳末尾截一张（时长可能为 Infinity，失败不影响结论）
  try {
    await page.evaluate(() => new Promise((resolve) => {
      const v = document.querySelector('video.burn-canvas');
      if (!v) return resolve();
      const done = () => { v.removeEventListener('seeked', done); setTimeout(resolve, 400); };
      v.addEventListener('seeked', done);
      if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.6);
      else resolve();
      setTimeout(resolve, 1200);
    }));
  } catch { /* 忽略 seek 失败 */ }

  /* ---- SRT 真实下载：验证 BOM 与 CRLF ---- */
  const client = await page.target().createCDPSession();
  const dlDir = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\piying-downloads';
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.format-card')];
    cards[0].click(); // SRT
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.click('.export-grid .btn-primary');
  await new Promise((r) => setTimeout(r, 1200));
  const files = fs.readdirSync(dlDir).filter((f) => f.endsWith('.srt'));
  if (!files.length) errors.push('未找到下载的 SRT 文件');
  else {
    const bytes = fs.readFileSync(`${dlDir}\\${files[0]}`);
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const text = bytes.toString('utf8');
    const crlf = text.includes('\r\n');
    console.log(`SRT 下载: ${files[0]}, ${bytes.length}B, BOM=${hasBom}, CRLF=${crlf}`);
    if (!hasBom) errors.push('SRT 缺少 UTF-8 BOM');
    if (!crlf) errors.push('SRT 未使用 CRLF');
  }

  await page.screenshot({ path: `${SHOT}/07-burn.png` });

  /* ---- Worker 规模基准 ---- */
  if (process.env.SKIP_BENCH) {
    console.log('跳过基准');
  } else {
  await page.evaluate(() => (window.location.hash = '#/align'));
  await new Promise((r) => setTimeout(r, 500));
  const benchBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('两小时规模')),
  );
  await benchBtn.asElement()?.click();
  console.log('基准已启动，等待结果（DP 约 10-25s）…');
  await page.waitForFunction(
    () => document.body.innerText.includes('远低于 5 分钟') || document.body.innerText.includes('整体预计'),
    { timeout: 90000 },
  );
  const benchText = await page.evaluate(() => {
    const badges = [...document.querySelectorAll('.badge-gold')].map((b) => b.textContent);
    return badges.find((t) => t.includes('DP 实测')) ?? badges.join(' | ');
  });
  console.log('基准结论:', benchText);
  await page.screenshot({ path: `${SHOT}/08-bench.png` });
  }

  console.log('\n错误:', errors.length ? '\n' + errors.slice(0, 5).join('\n') : '无');
  console.log(errors.length ? '❌ BURN/BENCH FAILED' : '✅ BURN/BENCH PASSED');
} catch (e) {
  errors.push(e.stack || e.message);
  console.error(e);
} finally {
  await browser.close();
  if (errors.length) process.exit(1);
}
