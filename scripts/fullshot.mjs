import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  defaultViewport: { width: 1500, height: 1000 },
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const clickByText = async (t) =>
  page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), t);
await page.goto('http://127.0.0.1:4783/', { waitUntil: 'networkidle0' });
await clickByText('用这出戏对齐');
await page.waitForFunction(() => document.body.innerText.includes('音频就绪'), { timeout: 15000 });
await clickByText('开始自动对齐');
await page.waitForFunction(() => document.body.innerText.includes('前往字幕编辑'), { timeout: 30000 });
await clickByText('前往字幕编辑');
await page.waitForSelector('.cue-card.missing-line');
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'shots/08-fulllist.png', fullPage: true });
console.log('saved full');
await browser.close();
