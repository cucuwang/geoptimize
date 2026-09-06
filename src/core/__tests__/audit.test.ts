import { afterEach, describe, expect, it, vi } from 'vitest';
import { audit, auditDocument } from '../audit.js';
import { parseHtml, parseMarkdown } from '../scanner.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auditDocument', () => {
  it('reports evidence-backed checks without a score', () => {
    const html = `<!doctype html>
      <html lang="en">
        <head>
          <title>Evidence guide</title>
          <meta name="description" content="A page-specific evidence guide.">
          <link rel="canonical" href="https://example.com/guide">
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
        </head>
        <body>
          <main>
            <h1>Evidence guide</h1>
            <h2>Checks</h2>
            <p>This page describes deterministic checks with enough visible content for parsing.</p>
            <a href="/details">Details</a>
            <img src="diagram.png" alt="Audit data flow">
          </main>
        </body>
      </html>`;
    const doc = parseHtml(html, 'https://example.com/guide');
    const report = auditDocument(doc, {
      target: { type: 'file', input: 'guide.html' },
      rendering: 'local-html',
    });

    expect(report.contractVersion).toBe('1.0');
    expect(report.checks).toHaveLength(10);
    expect(report.summary.FAIL).toBe(0);
    expect(report.summary.WARNING).toBe(1);
    expect(report.summary.PASS).toBe(8);
    expect(report.summary['N/A']).toBe(1);
    expect(report).not.toHaveProperty('score');
    expect(report).not.toHaveProperty('overall');
    expect(report.checks.every((check) => check.evidence.length > 0)).toBe(true);
    expect(report.checks.every((check) => check.validation.length > 0)).toBe(true);
    expect(Object.keys(report).sort()).toEqual([
      'checks',
      'contractVersion',
      'limitations',
      'rendering',
      'summary',
      'target',
      'timestamp',
    ]);
    expect(Object.keys(report.summary).sort()).toEqual(['FAIL', 'N/A', 'PASS', 'WARNING']);
    for (const check of report.checks) {
      expect(Object.keys(check).sort()).toEqual([
        'evidence',
        'explanation',
        'id',
        'label',
        'remediation',
        'status',
        'validation',
      ]);
      expect(['PASS', 'WARNING', 'FAIL', 'N/A']).toContain(check.status);
    }
  });

  it('distinguishes confirmed failures, review warnings, and unavailable checks', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org",}</script>
      <script type="application/ld+json">null</script>
      </head><body><img src="hero.jpg"><p>Visible copy for the audit fixture.</p></body></html>`;
    const document = parseHtml(html, 'fixture.html');
    const report = auditDocument(document, {
      target: { type: 'file', input: 'fixture.html' },
      rendering: 'local-html',
    });

    expect(document.jsonLdErrors).toHaveLength(2);
    expect(report.checks.find((check) => check.id === 'document-title')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'heading-structure')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'json-ld-structure')?.status).toBe('FAIL');
    expect(report.checks.find((check) => check.id === 'document-language')?.status).toBe('WARNING');
    expect(report.checks.find((check) => check.id === 'canonical-link')?.status).toBe('WARNING');
    expect(report.checks.find((check) => check.id === 'image-alternatives')?.status).toBe('WARNING');
    expect(report.checks.find((check) => check.id === 'http-status')?.status).toBe('N/A');
  });

  it('keeps unavailable canonical evidence separate and reads every robots directive', () => {
    const document = parseHtml(`<html><head>
      <title>Local page</title>
      <link rel="canonical" href="../page">
      <meta name="RoBoTs" content="index,follow">
      <meta name="GOOGLEBOT" content="NoIndex,nofollow">
      <meta name="robots" content="index">
      <script type="application/ld+json">{"name":"A structurally valid object"}</script>
      </head><body><h1>Local page</h1></body></html>`, 'page.html');
    const report = auditDocument(document, {
      target: { type: 'file', input: 'page.html' },
      rendering: 'local-html',
    });

    expect(document.metaTagValues).toMatchObject({
      robots: ['index,follow', 'index'],
      googlebot: ['NoIndex,nofollow'],
    });
    expect(report.checks.find((check) => check.id === 'canonical-link')?.status).toBe('N/A');
    expect(report.checks.find((check) => check.id === 'robots-directives')?.status).toBe('WARNING');
    expect(report.checks.find((check) => check.id === 'json-ld-structure')?.status).toBe('PASS');
  });

  it('does not claim rendered metadata for Markdown source files', () => {
    const report = auditDocument(parseMarkdown('# Guide\n\nSee [details](/details).', 'guide.md'), {
      target: { type: 'file', input: 'guide.md' },
      rendering: 'markdown',
    });

    expect(report.checks.find((check) => check.id === 'meta-description')?.status).toBe('N/A');
    expect(report.checks.find((check) => check.id === 'document-language')?.status).toBe('N/A');
    expect(report.checks.find((check) => check.id === 'canonical-link')?.status).toBe('N/A');
    expect(report.checks.find((check) => check.id === 'link-discovery')?.status).toBe('PASS');
  });
});

describe('audit', () => {
  it('records redirect, final URL, status, and X-Robots-Tag evidence', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      expect(init?.redirect).toBe('manual');
      if (url === 'https://example.com/') {
        return new Response(null, { status: 301, headers: { location: '/guide' } });
      }
      if (url === 'https://example.com/guide') {
        return new Response(
          '<html lang="en"><head><title>Guide</title><link rel="canonical" href="https://example.com/guide"></head><body><h1>Guide</h1><a href="/">Home</a></body></html>',
          { status: 200, headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await audit({ type: 'url', path: 'https://example.com/' });

    expect(report.target.finalUrl).toBe('https://example.com/guide');
    expect(report.rendering).toBe('response-html');
    expect(report.checks.find((check) => check.id === 'http-status')).toMatchObject({ status: 'PASS' });
    expect(report.checks.find((check) => check.id === 'robots-directives')).toMatchObject({ status: 'WARNING' });
    const httpEvidence = report.checks.find((check) => check.id === 'http-status')?.evidence[0].observed;
    expect(httpEvidence).toMatchObject({ status: 200, redirectCount: 1, contentType: 'text/html' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects directory targets until a bounded crawl contract exists', async () => {
    await expect(audit({ type: 'directory', path: './dist' })).rejects.toThrow(
      'currently supports one URL or one HTML/Markdown file',
    );
  });
});
