// Synthetic response-HTML fixture. No network requests or external measurements.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseHtml, scanDocument, SCORING_VERSION } from '../dist/core/scanner.js';
import { renderVisualReport } from '../dist/core/visual-report.js';
import { auditSite } from '../dist/core/site-audit.js';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/prepare-metrics-demo.mjs <empty-output-directory>');
await mkdir(directory, { recursive: true });
const originalFetch = globalThis.fetch;
let fixed = false;
const origin = 'https://demo.example';
const paths = ['/', '/guide', '/contact'];
const badPage = await readFile(new URL('../src/core/__tests__/fixtures/bad-page.html', import.meta.url), 'utf8');
const goodPage = await readFile(new URL('../src/core/__tests__/fixtures/good-page.html', import.meta.url), 'utf8');
const sparsePage = '<html><head><title>Demo</title></head><body>Contact information</body></html>';
const blockedPage = `<html><head><title>Demo</title><meta name="robots" content="noindex"></head><body>${'SEO '.repeat(350)}</body></html>`;
const pageHtml = (path) => (fixed ? goodPage : path === '/guide' ? sparsePage : path === '/contact' ? blockedPage : badPage)
  .replace(/href="\/[^"\n]*"/g, 'href="/"')
  .replace(/<title>.*?<\/title>/s, `<title>${fixed ? `Demo ${path}` : 'Demo'}</title>`)
  .replace('</head>', `${fixed ? `<link rel="canonical" href="${origin}${path}">` : ''}</head>`)
  .replace('</body>', `${paths.map(p => `<a href="${p}">${p}</a>`).join('')}</body>`);
const readiness = () => {
  const pages = paths.map(path => scanDocument(parseHtml(pageHtml(path), `${origin}${path}`), { details: true, sourceCapture: 'response-html' }));
  const overall = { ...pages[0].scores };
  for (const key of ['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity']) overall[key] = Math.round(pages.reduce((sum, page) => sum + page.scores[key], 0) / pages.length);
  overall.total = overall.structure + overall.citability + overall.schema + overall.aiMetadata + overall.contentDensity;
  return { scoringVersion: SCORING_VERSION, pages, overall, summary: 'Synthetic demonstration', timestamp: new Date().toISOString() };
};
globalThis.fetch = async (input) => {
  const url = String(input);
  if (!url.startsWith(`${origin}/`)) throw new Error('Unexpected fixture URL');
  const path = new URL(url).pathname;
  if (path === '/robots.txt') return new Response('', { status: 404 });
  if (path === '/sitemap.xml') return new Response(`<urlset>${paths.map(p => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`);
  if (!paths.includes(path)) return new Response('Missing', { status: 404 });
  return new Response(pageHtml(path), { headers: { 'content-type': 'text/html' } });
};
try {
  const before = await auditSite(origin, { maxPages: 20 });
  const beforeScan = readiness();
  fixed = true;
  const after = await auditSite(origin, { maxPages: 20 });
  const afterScan = readiness();
  for (const [name, report] of [['before', before], ['after', after], ['before-scan', beforeScan], ['after-scan', afterScan]]) {
    await writeFile(join(resolve(directory), `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  await writeFile(join(resolve(directory), 'report.html'), renderVisualReport(beforeScan, { site: before, demo: true }), { flag: 'wx' });
  await writeFile(join(resolve(directory), 'report-after.html'), renderVisualReport(afterScan, { site: after, baselineSite: before, baseline: beforeScan, demo: true }), { flag: 'wx' });
  await mkdir(join(directory, 'site'), { recursive: true });
  await writeFile(join(directory, 'site', 'index.html'), pageHtml('/'), { flag: 'wx' });
} finally {
  globalThis.fetch = originalFetch;
}
