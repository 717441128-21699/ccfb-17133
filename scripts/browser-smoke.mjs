import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_URL = 'http://127.0.0.1:4783/';
const shots = new URL('../shots/', import.meta.url);
mkdirSync(fileURLToPath(shots), { recursive: true });

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1500, height: 1000 },
  args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure()?.errorText ?? '')));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = async (text) =>
  page.evaluate((t) => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => x.textContent.includes(t));
    if (!b) throw new Error('no button with text ' + t);
    b.click();
  }, text);

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.brand-seal');
  await page.screenshot({ path: fileURLToPath(new URL('../shots/01-import.png', import.meta.url)) });
  console.log('✓ 导入页渲染');

  await clickByText('用这出戏对齐');
  await page.waitForFunction(() => document.body.innerText.includes('录音对齐'), { timeout: 5000 });
  await page.waitForFunction(() => document.body.innerText.includes('音频就绪'), { timeout: 15000 });
  console.log('✓ 示例 WAV 加载/解码成功');
  await page.screenshot({ path: fileURLToPath(new URL('../shots/02-align-audio.png', import.meta.url)) });

  await clickByText('开始自动对齐');
  await page.waitForFunction(() => document.body.innerText.includes('前往字幕编辑'), { timeout: 30000 });
  await sleep(400);
  const stats = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      hasMissing: txt.includes('唱本有、录音没唱'),
      bodySnippet: txt.slice(txt.indexOf('对齐结果概览'), txt.indexOf('对齐结果概览') + 260),
    };
  });
  console.log('✓ Worker 对齐完成；', stats.hasMissing ? '漏句提醒已出现' : '（未见漏句提醒）');
  await page.screenshot({ path: fileURLToPath(new URL('../shots/03-align-done.png', import.meta.url)) });

  await clickByText('前往字幕编辑');
  await page.waitForSelector('.wave-canvas', { timeout: 8000 });
  await page.waitForSelector('.cue-card', { timeout: 8000 });
  await sleep(600);
  const editor = await page.evaluate(() => ({
    cues: document.querySelectorAll('.cue-card:not(.missing-line)').length,
    missing: document.querySelectorAll('.cue-card.missing-line').length,
    extras: document.querySelectorAll('.token-extra').length,
    waveWidth: document.querySelector('.wave-canvas')?.width ?? 0,
  }));
  console.log('✓ 编辑页：', JSON.stringify(editor));
  if (editor.cues < 6) throw new Error('cue 数量过少');
  if (editor.missing < 1) throw new Error('缺少黄色漏句卡');
  if (editor.extras < 3) throw new Error('灰色衬字过少: ' + editor.extras);
  await page.screenshot({ path: fileURLToPath(new URL('../shots/04-editor.png', import.meta.url)) });

  // 选中第一条 cue，检查检查器与逐字 chip
  await page.evaluate(() => document.querySelector('.cue-card:not(.missing-line)').click());
  await sleep(300);
  await page.waitForSelector('.char-chip', { timeout: 5000 });
  const chips = await page.$$eval('.char-chip', (els) => els.length);
  console.log('✓ 检查器逐字 chip 数：', chips);
  await page.screenshot({ path: fileURLToPath(new URL('../shots/05-inspector.png', import.meta.url)) });

  // 预览舞台存在且有字幕文本
  const stageText = await page.$eval('.stage', (el) => el.innerText).catch(() => '');
  console.log('✓ 预览舞台文本长度：', stageText.length);

  // 导出页
  await clickByText('导出烧录');
  await page.waitForSelector('.format-card', { timeout: 5000 });
  await page.waitForFunction(() => (document.querySelector('.preview-code')?.textContent ?? '').includes('-->'), { timeout: 5000 });
  const srtHead = await page.$eval('.preview-code', (el) => el.textContent.slice(0, 80));
  console.log('✓ SRT 预览：', JSON.stringify(srtHead.replace(/\n/g, ' | ')));
  await clickByText('ASS/SSA');
  await page.waitForFunction(() => (document.querySelector('.preview-code')?.textContent ?? '').includes('[Script Info]'), { timeout: 5000 });
  console.log('✓ ASS 预览含 [Script Info]');
  await page.screenshot({ path: fileURLToPath(new URL('../shots/06-export.png', import.meta.url)) });

  // 烧录面板 canvas 存在
  await page.waitForSelector('.burn-canvas');
  console.log('✓ 烧录 canvas 已挂载');
} catch (e) {
  await page.screenshot({ path: fileURLToPath(new URL('../shots/99-error.png', import.meta.url)) }).catch(() => {});
  console.error('SMOKE FAIL:', e.message);
  process.exitCode = 1;
} finally {
  if (errors.length) {
    console.log('\n--- 浏览器错误 (' + errors.length + ') ---');
    [...new Set(errors)].slice(0, 25).forEach((e) => console.log(e.slice(0, 300)));
  } else {
    console.log('\n✓ 无浏览器 console/page 错误');
  }
  await browser.close();
}
