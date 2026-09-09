import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/verify-visual-report.mjs <prepared-demo-directory>');
const browser = await puppeteer.launch({ executablePath: process.env.GEO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await mkdir(join(directory, 'screenshots'), { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    await page.setViewport({ width, height });
    await page.goto(pathToFileURL(resolve(directory, 'report.html')).href);
    await page.waitForSelector('meter');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`${name} overflow`);
    if (await page.$$eval('meter', nodes => nodes.length) !== 5) throw new Error('Missing original score dimensions');
    await page.screenshot({ path: join(directory, 'screenshots', `${name}.png`), fullPage: true });
    await page.click('[data-view="pages"]');
    await page.type('#page-search', 'no-such-page-123');
    if (!await page.$eval('#no-pages', n => !n.hidden)) throw new Error('Page search empty state failed');
    await page.click('[data-view="evidence"]');
    if (!await page.$eval('#severity', n => n.parentElement.textContent.includes('Scoring severity'))) throw new Error('Unclear filter scope');
    await page.select('#severity', 'critical');
    const wrongVisible = await page.$$eval('#findings details', nodes => nodes.some(n => !n.hidden && n.dataset.severity !== 'critical'));
    if (wrongVisible) throw new Error('Severity filter failed');
    await page.select('#severity', 'all');
    await page.click('#findings details summary');
    if (!await page.$eval('#findings details', n => n.open)) throw new Error('Evidence disclosure failed');
    await page.screenshot({ path: join(directory, 'screenshots', `${name}-evidence.png`), fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(pathToFileURL(resolve(directory, 'report-after.html')).href);
  if (!await page.$eval('body', n => n.textContent.includes('Before and current'))) throw new Error('Missing comparison chart');
  await page.click('.metric-details summary');
  if (await page.$$eval('.metric-details tbody tr', nodes => nodes.length) !== 19) throw new Error('Missing site metrics');
  await page.screenshot({ path: join(directory, 'screenshots', 'desktop-after.png'), fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Desktop/mobile rendering, five score bars, page search, severity filters, evidence disclosures and nineteen site metrics passed.');
} finally { await browser.close(); }
