import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditSite } from '../site-audit.js';
import { parseSiteReport, summarizeSite } from '../site-metrics.js';

afterEach(() => vi.restoreAllMocks());

async function crawl(fixed = false, count = 3, maxPages = 200) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url.endsWith('/sitemap.xml')) return new Response(`<urlset>${Array.from({ length: count }, (_, i) => `<url><loc>https://example.com/${i || ''}</loc></url>`).join('')}</urlset>`);
    const path = new URL(url).pathname;
    const links = Array.from({ length: count }, (_, i) => `<a href="/${i || ''}">Page</a>`).join('');
    return new Response(`<html lang="en"><head><title>${fixed ? path : 'Shared'}</title>${fixed ? `<link rel="canonical" href="${url}">` : ''}</head><body>${links}</body></html>`, { headers: { 'content-type': 'text/html' } });
  });
  return auditSite('https://example.com/', { maxPages });
}

describe('site metrics', () => {
  it('counts full findings beyond the twenty-item evidence sample', async () => {
    const report = await crawl(false, 25);
    const raw = report.checks.find(c => c.id === 'canonical-consistency')!.evidence[0].observed;
    expect(raw.missingCanonicals).toHaveLength(20);
    expect(raw.missingCanonicalCount).toBe(25);
    const metrics = summarizeSite(report);
    expect(metrics.metrics).toHaveLength(19);
    expect(metrics.metrics.find(m => m.id === 'missing-canonicals')!.value).toBe(25);
    expect(report.findings!.filter(f => f.kind === 'missing-canonical')).toHaveLength(25);
  });

  it('compares matching observations and identifies added, absent and persisting findings', async () => {
    const before = await crawl();
    const after = await crawl(true);
    after.findings!.push({ kind: 'review', target: 'https://example.com/' });
    before.findings!.push({ kind: 'retained', target: 'https://example.com/' });
    after.findings!.push({ kind: 'retained', target: 'https://example.com/' });
    const comparison = summarizeSite(after, before).comparison!;
    expect(comparison.comparable).toBe(true);
    expect(comparison.changes.find(c => c.id === 'missing-canonicals')!.delta).toBe(-3);
    expect(comparison.findings!.noLongerObserved).toHaveLength(4);
    expect(comparison.findings!.added).toHaveLength(1);
    expect(comparison.findings!.persisting).toHaveLength(1);
  });

  it('withholds deltas when the inspected URL set changes', async () => {
    const before = await crawl(false, 3);
    const after = await crawl(true, 2);
    const comparison = summarizeSite(after, before).comparison!;
    expect(comparison.reasons).toContain('Crawled URL set changed.');
    expect(comparison.changes.every(c => c.delta === null)).toBe(true);
    expect(comparison.findings).toBeNull();
  });

  it('does not compare partial, unavailable, differently configured or reversed scans', async () => {
    const before = await crawl();
    const after = structuredClone(before);
    after.truncated = true;
    after.maxPages = 100;
    after.pages[0].status = 0;
    after.timestamp = '2000-01-01T00:00:00Z';
    after.robots.skippedUrls.push('https://example.com/private');
    expect(summarizeSite(after, before).comparison!.reasons).toHaveLength(5);
  });

  it('preserves unknown counts in older reports instead of counting truncated samples', async () => {
    const report = await crawl(false, 25);
    delete report.metricEvidenceVersion;
    delete report.findings;
    delete report.checks.find(c => c.id === 'canonical-consistency')!.evidence[0].observed.missingCanonicalCount;
    const metrics = summarizeSite(report, report);
    expect(metrics.metrics.find(m => m.id === 'missing-canonicals')!.value).toBeNull();
    expect(metrics.comparison!.comparable).toBe(false);
  });

  it('keeps unavailable checks null and rejects unknown metric evidence versions', async () => {
    const report = await crawl();
    report.checks.find(c => c.id === 'sitemap-consistency')!.status = 'N/A';
    expect(summarizeSite(report).metrics.find(m => m.id === 'sitemap-urls')!.value).toBeNull();
    expect(() => parseSiteReport({ ...report, metricEvidenceVersion: '2.0' })).toThrow();
  });

  it('rejects malformed imports and invalid numeric evidence', async () => {
    expect(() => parseSiteReport({ contractVersion: '1.0' })).toThrow(/audit-site/);
    const report = await crawl();
    report.checks.find(c => c.id === 'canonical-consistency')!.evidence[0].observed.missingCanonicalCount = -1;
    expect(() => summarizeSite(report)).toThrow(/Invalid count/);
    report.pages.push(report.pages[0]);
    expect(() => parseSiteReport(report)).toThrow();
  });
});
