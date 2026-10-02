import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const out = '/tmp/skyreach-shots';
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1280,720',
  ],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => window.__SKY, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${out}/01-title.png` });

const title = await page.evaluate(() => window.__SKY.getState());
console.log('title', title);

await page.click('#start-walk');
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 2500));
await page.keyboard.up('KeyW');
await new Promise((r) => setTimeout(r, 200));
const walked = await page.evaluate(() => window.__SKY.getState());
console.log('walked', walked);
await page.screenshot({ path: `${out}/02-walk.png` });

await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 700));
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
const jumped = await page.evaluate(() => window.__SKY.getState());
console.log('jumped', { y: jumped.y, grounded: jumped.grounded, mode: jumped.mode });

await page.evaluate(() => window.__SKY.setPos(8, 110, -338));
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => window.__SKY.deploy());
await new Promise((r) => setTimeout(r, 2500));
const glide = await page.evaluate(() => window.__SKY.getState());
console.log('glide', glide);
await page.screenshot({ path: `${out}/03-glide.png` });

await page.evaluate(() => window.__SKY.setTime(0.96));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${out}/04-night.png` });

await page.evaluate(() => window.__SKY.setTime(0.73));
await page.evaluate(() => window.__SKY.setPos(0, 6, 42));
await new Promise((r) => setTimeout(r, 800));
const plaza = await page.evaluate(() => window.__SKY.getState());
console.log('plaza', { place: plaza.place, motes: plaza.motes, landmarks: plaza.landmarks, mode: plaza.mode, y: plaza.y });
await page.screenshot({ path: `${out}/05-plaza.png` });

console.log('errors', errors.slice(0, 12));
await browser.close();
