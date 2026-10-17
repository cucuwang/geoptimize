import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditSite, parseRobotsTxt, parseSitemapDocument, robotsAllows } from '../site-audit.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('robots policy', () => {
  it('selects the most specific user-agent group and applies longest-match precedence', () => {
    const policy = parseRobotsTxt(`
      User-agent: *
      Disallow: /private
      Allow: /private/public$
      Sitemap: https://example.com/sitemap.xml

      User-agent: geoptimize
      Disallow: /preview
      Allow: /preview/public
    `);

    expect(policy.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
    expect(robotsAllows('https://example.com/private', policy)).toBe(true);
    expect(robotsAllows('https://example.com/preview/draft', policy)).toBe(false);
    expect(robotsAllows('https://example.com/preview/public', policy)).toBe(true);
  });

  it('uses wildcard rules when no specific product token matches', () => {
    const policy = parseRobotsTxt(`
      User-agent: *
      Disallow: /private
      Allow: /private/public$
    `, 'another-crawler');

    expect(robotsAllows('https://example.com/private', policy)).toBe(false);
    expect(robotsAllows('https://example.com/private/public', policy)).toBe(true);
    expect(robotsAllows('https://example.com/private/public/child', policy)).toBe(false);
  });

  it('prefers the exact crawler product token over its shorter prefix', () => {
    const policy = parseRobotsTxt(`
      User-agent: geoptimize
      Allow: /private

      User-agent: geoptimize-site-audit
      Disallow: /private
    `);

    expect(robotsAllows('https://example.com/private', policy)).toBe(false);
  });

  it('strips long comments including Unicode separators without creating directives', () => {
    const commentTail = '#'.repeat(20_000) + '\u2028Allow: /comment-allow\u2029Disallow: /comment-disallow';
    const policy = parseRobotsTxt(
      `User-agent: *${commentTail}\n` +
      `Disallow: /private${commentTail}\n` +
      `Allow: /private/public$${commentTail}\n` +
      `Sitemap: https://example.com/sitemap.xml${commentTail}`,
    );

    expect(policy.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
    expect(policy.rules).toEqual([
      { directive: 'disallow', pattern: '/private' },
      { directive: 'allow', pattern: '/private/public$' },
    ]);
    expect(robotsAllows('https://example.com/private', policy)).toBe(false);
    expect(robotsAllows('https://example.com/private/public', policy)).toBe(true);
    expect(robotsAllows('https://example.com/private/public/child', policy)).toBe(false);
    expect(robotsAllows('https://example.com/comment-disallow', policy)).toBe(true);
  });
});

describe('sitemap parsing', () => {
  it('parses URL sets and sitemap indexes without inferring other XML links', () => {
    expect(parseSitemapDocument(`
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>
    `)).toEqual({
      kind: 'urlset',
      urls: ['https://example.com/', 'https://example.com/about'],
    });

    expect(parseSitemapDocument(`
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
      </sitemapindex>
    `)).toEqual({ kind: 'index', urls: ['https://example.com/pages.xml'] });
  });
});

describe('auditSite', () => {
  it.each([
    ['/cdn-cgi/l/email-protection#abc123'],
    [
      '/cdn-cgi/l/email-protection#abc123',
      '/cdn-cgi/l/email-protection#abc123',
    ],
    [
      '/cdn-cgi/l/email-protection#abc123',
      '/cdn-cgi/l/email-protection#def456',
      'https://example.com/cdn-cgi/l/email-protection?email=1#abc123',
    ],
  ].map((hrefs) => ({ hrefs })))('skips Cloudflare email links and counts occurrences: $hrefs', async ({ hrefs }) => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url === 'https://example.com/') {
        return new Response(`<html><head><title>Home</title></head><body>
          ${hrefs.map((href) => `<a href="${href}">Email</a>`).join('')}
          <a href="/about">About</a></body></html>`, {
          status: 200, headers: { 'content-type': 'text/html' },
        });
      }
      if (url === 'https://example.com/about') {
        return new Response('<html><head><title>About</title></head><body>About</body></html>', {
          status: 200, headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 2 });

    const requestedPaths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname);
    expect(requestedPaths).not.toContain('/cdn-cgi/l/email-protection');
    expect(requestedPaths).toContain('/about');
    expect(report.crawledPages).toBe(2);
    expect(report.truncated).toBe(false);
    expect(report.pages[0].internalLinkCount).toBe(1);
    expect(report.checks.find((check) => check.id === 'site-http-status')?.status).toBe('PASS');
    expect(report.checks.find((check) => check.id === 'internal-link-targets')).toMatchObject({
      status: 'PASS',
      evidence: [{ observed: { discoveredTargetCount: 1, brokenTargetCount: 0, uncheckedTargetCount: 0 } }],
    });
    expect(report.findings?.filter((finding) =>
      finding.kind === 'http-error' || finding.kind === 'broken-internal-target',
    )).toEqual([]);
    expect(report.limitations).toContain(
      `Skipped ${hrefs.length} Cloudflare email-protection link(s) in crawled HTML; /cdn-cgi/l/email-protection links are excluded from page discovery and internal link targets.`,
    );
  });

  it('counts Cloudflare email link occurrences across crawled pages', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const path = new URL(input).pathname;
      if (path === '/' || path === '/about') {
        return new Response(`<html><body>
          <a href="/cdn-cgi/l/email-protection#abc123">Email</a>
          ${path === '/' ? '<a href="/about">About</a>' : ''}
          </body></html>`, {
          status: 200, headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 2 });

    const requestedPaths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname);
    expect(requestedPaths).not.toContain('/cdn-cgi/l/email-protection');
    expect(requestedPaths).toContain('/about');
    expect(report.crawledPages).toBe(2);
    expect(report.pages.map((page) => page.internalLinkCount)).toEqual([1, 0]);
    expect(report.limitations).toContain(
      'Skipped 2 Cloudflare email-protection link(s) in crawled HTML; /cdn-cgi/l/email-protection links are excluded from page discovery and internal link targets.',
    );
  });

  it.each(['', '#abc123', '?email=1#abc123'])(
    'excludes Cloudflare email links listed in HTML and sitemap from orphan candidates (%s) while preserving HTTP and sitemap checks',
    async (suffix) => {
      const emailUrl = `https://example.com/cdn-cgi/l/email-protection${suffix}`;
      const normalizedEmailUrl = emailUrl.split('#')[0];
      const fetchMock = vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url === 'https://example.com/') {
          return new Response(`<html><body><a href="${emailUrl}">Email</a></body></html>`, {
            status: 200, headers: { 'content-type': 'text/html' },
          });
        }
        if (url === 'https://example.com/sitemap.xml') {
          return new Response(`<urlset>
            <url><loc>https://example.com/</loc></url>
            <url><loc>${emailUrl}</loc></url>
            </urlset>`, {
            status: 200, headers: { 'content-type': 'application/xml' },
          });
        }
        return new Response('', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const report = await auditSite('https://example.com/');

      expect(fetchMock.mock.calls.some(([url]) => url.toString() === normalizedEmailUrl)).toBe(true);
      expect(report.checks.find((check) => check.id === 'orphan-candidates')).toMatchObject({
        status: 'PASS',
        evidence: [{ observed: { candidateCount: 0, candidates: [] } }],
      });
      expect(report.findings?.filter((finding) => finding.kind === 'orphan-candidate')).toEqual([]);
      expect(report.checks.find((check) => check.id === 'site-http-status')?.status).toBe('FAIL');
      expect(report.findings).toContainEqual({ kind: 'http-error', target: normalizedEmailUrl });
      expect(report.checks.find((check) => check.id === 'sitemap-consistency')).toMatchObject({
        status: 'FAIL',
        evidence: [{ observed: { sitemapUrlCount: 2, brokenSitemapPages: [normalizedEmailUrl] } }],
      });
    },
  );

  it('still audits other cdn-cgi paths and email-protection lookalikes', async () => {
    const paths = ['/cdn-cgi/other', '/cdn-cgi/l/email-protection-help'];
    const fetchMock = vi.fn(async (input: string | URL) => {
      if (input.toString() === 'https://example.com/') {
        return new Response(`<html><body>${paths.map((path) => `<a href="${path}">Link</a>`).join('')}</body></html>`, {
          status: 200, headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/');

    for (const path of paths) {
      expect(fetchMock.mock.calls.some(([url]) => url.toString() === `https://example.com${path}`)).toBe(true);
      expect(report.findings).toContainEqual({ kind: 'http-error', target: `https://example.com${path}` });
      expect(report.findings).toContainEqual({ kind: 'broken-internal-target', target: `https://example.com${path}` });
    }
    expect(report.checks.find((check) => check.id === 'site-http-status')?.status).toBe('FAIL');
    expect(report.limitations.some((limitation) => limitation.startsWith('Skipped '))).toBe(false);
  });

  it('reports broken links, sitemap-only pages, duplicate titles, and robots skips', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      expect(init?.redirect).toBe('manual');
      expect(new Headers(init?.headers).get('user-agent')).toBe('geoptimize-site-audit');

      if (url === 'https://example.com/') {
        return new Response(`
          <html lang="en"><head><title>Home</title><link rel="canonical" href="https://example.com/"></head>
          <body><h1>Home</h1><a href="/about">About</a><a href="/missing">Missing</a><a href="/private">Private</a><a href="https://outside.example/">Outside</a></body></html>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url === 'https://example.com/robots.txt') {
        return new Response('User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml\n', { status: 200 });
      }
      if (url === 'https://example.com/sitemap.xml') {
        return new Response(`
          <urlset>
            <url><loc>https://example.com/</loc></url>
            <url><loc>https://example.com/about</loc></url>
            <url><loc>https://example.com/orphan</loc></url>
            <url><loc>https://example.com/missing</loc></url>
          </urlset>
        `, { status: 200, headers: { 'content-type': 'application/xml' } });
      }
      if (url === 'https://example.com/about') {
        return new Response(`
          <html lang="en"><head><title>Shared title</title><link rel="canonical" href="https://example.com/about"></head>
          <body><h1>About</h1><a href="/">Home</a></body></html>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url === 'https://example.com/orphan') {
        return new Response(`
          <html lang="en"><head><title>Shared title</title><link rel="canonical" href="https://example.com/orphan"></head>
          <body><h1>Orphan candidate</h1></body></html>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url === 'https://example.com/missing') {
        return new Response('<html><head><title>Missing</title></head><body>Gone</body></html>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 10 });

    expect(report.contractVersion).toBe('1.0');
    expect(report.crawledPages).toBe(4);
    expect(report.truncated).toBe(false);
    expect(Object.keys(report).sort()).toEqual([
      'checks',
      'contractVersion',
      'crawledPages',
      'findings',
      'limitations',
      'maxPages',
      'metricEvidenceVersion',
      'origin',
      'pages',
      'robots',
      'sitemaps',
      'startUrl',
      'summary',
      'timestamp',
      'truncated',
    ]);
    expect(Object.values(report.summary).reduce((sum, count) => sum + count, 0)).toBe(report.checks.length);
    expect(Object.keys(report.pages[0]).sort()).toEqual([
      'canonicalLinks',
      'contentType',
      'discoveredFrom',
      'externalLinkCount',
      'finalUrl',
      'internalLinkCount',
      'language',
      'redirects',
      'requestedUrl',
      'status',
      'statusText',
      'title',
    ]);
    expect(report.robots.skippedUrls).toEqual(['https://example.com/private']);
    expect(report.pages.map((page) => page.requestedUrl)).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/missing',
      'https://example.com/orphan',
    ]);
    expect(report.checks.find((check) => check.id === 'site-http-status')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'internal-link-targets')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'canonical-consistency')?.status).toBe('PASS');
    expect(report.checks.find((check) => check.id === 'sitemap-consistency')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'orphan-candidates')).toMatchObject({ status: 'WARNING' });
    expect(report.checks.find((check) => check.id === 'duplicate-titles')).toMatchObject({ status: 'WARNING' });
    expect(fetchMock.mock.calls.some(([url]) => url.toString() === 'https://example.com/private')).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.toString() === 'https://outside.example/')).toBe(false);
  });

  it('marks queued internal targets unchecked when the page limit is reached', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url === 'https://example.com/') {
        return new Response('<html><head><title>Home</title></head><body><h1>Home</h1><a href="/a">A</a><a href="/b">B</a></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url === 'https://example.com/robots.txt' || url === 'https://example.com/sitemap.xml') {
        return new Response('', { status: 404 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 1 });

    expect(report.crawledPages).toBe(1);
    expect(report.truncated).toBe(true);
    expect(report.checks.find((check) => check.id === 'crawl-coverage')?.status).toBe('WARNING');
    expect(report.checks.find((check) => check.id === 'internal-link-targets')?.status).toBe('WARNING');
  });

  it('does not follow a subsequent cross-origin redirect', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url === 'https://example.com/') {
        return new Response('<html><head><title>Home</title></head><body><h1>Home</h1><a href="/leave">Leave</a></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url === 'https://example.com/robots.txt' || url === 'https://example.com/sitemap.xml') {
        return new Response('', { status: 404 });
      }
      if (url === 'https://example.com/leave') {
        return new Response(null, { status: 302, headers: { location: 'https://outside.example/' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 5 });

    expect(report.pages.find((page) => page.requestedUrl.endsWith('/leave'))).toMatchObject({ status: 0 });
    expect(report.checks.find((check) => check.id === 'site-http-status')?.status).toBe('WARNING');
    const linkCheck = report.checks.find((check) => check.id === 'internal-link-targets');
    expect(linkCheck?.status).toBe('WARNING');
    expect(linkCheck?.evidence[0].observed).toMatchObject({
      brokenTargets: [],
      uncheckedTargets: ['https://example.com/leave'],
    });
    expect(fetchMock.mock.calls.some(([url]) => url.toString() === 'https://outside.example/')).toBe(false);
  });

  it('reports a malformed successful sitemap response as a confirmed failure', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url === 'https://example.com/') {
        return new Response('<html><head><title>Home</title></head><body><h1>Home</h1></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url === 'https://example.com/robots.txt') return new Response('', { status: 404 });
      if (url === 'https://example.com/sitemap.xml') {
        return new Response('<html><body>Not a sitemap</body></html>', { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 5 });
    const sitemapCheck = report.checks.find((check) => check.id === 'sitemap-consistency');

    expect(sitemapCheck?.status).toBe('FAIL');
    expect(sitemapCheck?.evidence[0].observed).toMatchObject({
      invalidSitemaps: ['https://example.com/sitemap.xml'],
    });
  });

  it('stops subsequent page crawling when robots policy is temporarily unavailable', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url === 'https://example.com/') {
        return new Response('<html><head><title>Home</title></head><body><h1>Home</h1><a href="/next">Next</a></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url === 'https://example.com/robots.txt') return new Response('', { status: 503 });
      if (url === 'https://example.com/sitemap.xml') return new Response('', { status: 404 });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await auditSite('https://example.com/', { maxPages: 5 });

    expect(report.crawledPages).toBe(0);
    expect(report.robots.status).toBe(503);
    expect(report.robots.skippedUrls).toEqual(['https://example.com/']);
    expect(report.checks.find((check) => check.id === 'robots-policy')?.status).toBe('WARNING');
    expect(fetchMock.mock.calls.some(([url]) => url.toString() === 'https://example.com/next')).toBe(false);
  });

  it('validates the maximum page boundary', async () => {
    await expect(auditSite('https://example.com/', { maxPages: 0 })).rejects.toThrow('--max-pages');
    await expect(auditSite('https://example.com/', { maxPages: 201 })).rejects.toThrow('--max-pages');
    await expect(auditSite('https://example.com/', { maxPages: 1.5 })).rejects.toThrow('--max-pages');
  });
});
