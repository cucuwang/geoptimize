// Synthetic response-HTML fixture. No network requests or external measurements.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { auditSite } from '../dist/core/site-audit.js';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/prepare-metrics-demo.mjs <empty-output-directory>');
await mkdir(directory, { recursive: true });
const originalFetch = globalThis.fetch;
let fixed = false;
const origin = 'https://demo.example';
const paths = ['/', '/guide', '/contact'];
globalThis.fetch = async (input) => {
  const url = String(input);
  if (!url.startsWith(`${origin}/`)) throw new Error('Unexpected fixture URL');
  const path = new URL(url).pathname;
  if (path === '/robots.txt') return new Response('', { status: 404 });
  if (path === '/sitemap.xml') return new Response(`<urlset>${paths.map(p => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`);
  if (!paths.includes(path)) return new Response('Missing', { status: 404 });
  return new Response(`<html lang="en"><head><title>${fixed ? `Demo ${path}` : 'Demo'}</title>${fixed ? `<link rel="canonical" href="${url}">` : ''}</head><body><h1>Example page</h1>${paths.map(p => `<a href="${p}">${p}</a>`).join('')}</body></html>`, { headers: { 'content-type': 'text/html' } });
};
try {
  const before = await auditSite(origin, { maxPages: 20 });
  fixed = true;
  const after = await auditSite(origin, { maxPages: 20 });
  for (const [name, report] of [['before', before], ['after', after]]) {
    await writeFile(join(resolve(directory), `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
} finally {
  globalThis.fetch = originalFetch;
}
