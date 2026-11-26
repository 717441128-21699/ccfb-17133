import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:4783/';
const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1500, height: 1000 },
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = async (t) =>
  page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), t);

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickByText('用这出戏对齐');
  await page.waitForFunction(() => document.body.innerText.includes('音频就绪'), { timeout: 15000 });
  await clickByText('开始自动对齐');
  await page.waitForFunction(() => document.body.innerText.includes('前往字幕编辑'), { timeout: 30000 });
  await clickByText('前往字幕编辑');
  await page.waitForSelector('.wave-canvas');
  await sleep(500);

  // 选中第一条普通 cue
  await page.evaluate(() => document.querySelector('.cue-card:not(.missing-line)').click());
  await sleep(200);
  const before = await page.$eval('.cue-card.selected .cue-time', (el) => el.textContent);
  console.log('拖动前时间：', before);

  // 拖动该 cue 的右边界 +60px（pps=96 -> +0.625s）
  const box = await page.$eval('.wave-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width };
  });
  // 第一条 cue 结束约 10.1s（从 SRT 已知），pps=96
  const endX = box.left + 10.09 * 96;
  const y = box.top + 75;
  await page.mouse.move(endX - 4, y);
  await sleep(100);
  await page.mouse.down();
  await page.mouse.move(endX + 30, y, { steps: 4 });
  await page.mouse.move(endX + 60, y, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  const afterEndDrag = await page.$eval('.cue-card.selected .cue-time', (el) => el.textContent);
  console.log('拖右边界后：', afterEndDrag);
  if (afterEndDrag === before) throw new Error('右边界拖动未改变时间');

  // 拖动左边界 -50px
  const startX = box.left + 4.68 * 96;
  await page.mouse.move(startX + 2, y);
  await sleep(80);
  await page.mouse.down();
  await page.mouse.move(startX - 30, y, { steps: 4 });
  await page.mouse.move(startX - 50, y, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  const afterStartDrag = await page.$eval('.cue-card.selected .cue-time', (el) => el.textContent);
  console.log('拖左边界后：', afterStartDrag);
  if (afterStartDrag === afterEndDrag) throw new Error('左边界拖动未改变时间');
  await page.screenshot({ path: 'shots/07-drag.png' });

  // 跳到导出页，测试烧录录制 2.5 秒后停止，不应抛错
  await clickByText('导出烧录');
  await page.waitForSelector('.burn-canvas');
  await sleep(400);
  await clickByText('开始录制并烧录');
  await sleep(2800);
  const recLabel = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('停止并下载'))?.textContent ?? '');
  console.log('录制中按钮：', recLabel.trim());
  await clickByText('停止并下载');
  await sleep(1200);
  console.log('✓ 边界拖动与 MediaRecorder 启停无异常');
} catch (e) {
  console.error('INTERACTION FAIL:', e.message);
  process.exitCode = 1;
} finally {
  const real = errors.filter((e) => !e.includes('Download is disallowed') && !e.includes('favicon'));
  if (real.length) {
    console.log('--- 错误 ---');
    [...new Set(real)].forEach((e) => console.log(e.slice(0, 300)));
  } else console.log('✓ 无页面错误');
  await browser.close();
}
