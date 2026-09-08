import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHtml, parseMarkdown, scanDocument, scanFile, scanDirectory, scan, scanUrl } from '../scanner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseHtml', () => {
  it('extracts title, headings, paragraphs, and JSON-LD', async () => {
    const html = await readFile(join(fixtures, 'good-page.html'), 'utf-8');
    const doc = parseHtml(html, 'https://example.com/geo-guide');

    expect(doc.title).toBe('What is Generative Engine Optimization (GEO)? An Evidence Guide');
    expect(doc.headings.length).toBeGreaterThan(3);
    expect(doc.headings[0]).toEqual({ level: 1, text: 'What is Generative Engine Optimization (GEO)?' });
    expect(doc.paragraphs.length).toBeGreaterThan(5);
    expect(doc.jsonLd.length).toBe(2);
    expect(doc.metaTags['description']).toContain('content readiness');
    expect(doc.metaTags['author']).toBe('Fixture Author');
  });

  it('handles minimal HTML without crashing', () => {
    const doc = parseHtml('<html><body><p>This is a test paragraph with enough words.</p></body></html>', 'test.html');
    expect(doc.title).toBe('test.html');
    expect(doc.paragraphs).toEqual(['This is a test paragraph with enough words.']);
    expect(doc.jsonLd).toEqual([]);
  });

  it('preserves the v0.6 score for a non-object JSON-LD value while exposing an audit error', () => {
    const doc = parseHtml('<script type="application/ld+json">42</script>', 'test.html');

    expect(doc.jsonLd).toEqual([42]);
    expect(doc.jsonLdErrors).toHaveLength(1);
    expect(scanDocument(doc).scores.schema).toBe(8);
  });
});

describe('parseMarkdown', () => {
  it('extracts frontmatter, headings, and paragraphs', async () => {
    const md = await readFile(join(fixtures, 'good-page.md'), 'utf-8');
    const doc = parseMarkdown(md, 'llms-txt-guide.md');

    expect(doc.title).toBe('Getting Started with llms.txt');
    expect(doc.frontmatter?.author).toBe('Fixture Author');
    expect(doc.headings.length).toBeGreaterThan(3);
    expect(doc.headings[0]).toEqual({ level: 1, text: 'Getting Started with llms.txt' });
    expect(doc.paragraphs.length).toBeGreaterThan(3);
  });

  it('handles markdown without frontmatter', () => {
    const doc = parseMarkdown('# Hello\n\nWorld', 'test.md');
    expect(doc.title).toBe('Hello');
    expect(doc.headings).toEqual([{ level: 1, text: 'Hello' }]);
  });
});

describe('scanDocument', () => {
  it('scores a well-structured page above 70', async () => {
    const html = await readFile(join(fixtures, 'good-page.html'), 'utf-8');
    const doc = parseHtml(html, 'https://example.com/geo-guide');
    const result = scanDocument(doc);

    expect(result.scores.total).toBeGreaterThanOrEqual(70);
    expect(result.scores.structure).toBeGreaterThan(15);
    expect(result.scores.schema).toBeGreaterThan(10);
    expect(result.issues.filter((i) => i.severity === 'critical')).toHaveLength(0);
  });

  it('scores the regression fixture below the evidence fixture', async () => {
    const [goodHtml, regressionHtml] = await Promise.all([
      readFile(join(fixtures, 'good-page.html'), 'utf-8'),
      readFile(join(fixtures, 'bad-page.html'), 'utf-8'),
    ]);
    const good = scanDocument(parseHtml(goodHtml, 'https://example.com/evidence-guide'));
    const regression = scanDocument(parseHtml(regressionHtml, 'https://example.com/seo-tips'));

    expect(regression.scores.total).toBeLessThan(good.scores.total);
    expect(regression.issues.some((issue) => issue.message.includes('No H1'))).toBe(true);
    expect(regression.issues.some((issue) => issue.message.includes('No meta description'))).toBe(true);
    expect(regression.suggestions.length).toBeGreaterThan(0);
  });

  it('returns all five dimension scores', async () => {
    const html = await readFile(join(fixtures, 'good-page.html'), 'utf-8');
    const doc = parseHtml(html, 'test');
    const result = scanDocument(doc);

    expect(result.scores).toHaveProperty('structure');
    expect(result.scores).toHaveProperty('citability');
    expect(result.scores).toHaveProperty('schema');
    expect(result.scores).toHaveProperty('aiMetadata');
    expect(result.scores).toHaveProperty('contentDensity');
    expect(result.scores.total).toBe(
      result.scores.structure + result.scores.citability + result.scores.schema + result.scores.aiMetadata + result.scores.contentDensity
    );
  });
});

describe('scanFile', () => {
  it('scans an HTML file', async () => {
    const result = await scanFile(join(fixtures, 'good-page.html'));
    expect(result.scores.total).toBeGreaterThan(0);
    expect(result.title).toContain('GEO');
  });

  it('scans a Markdown file', async () => {
    const result = await scanFile(join(fixtures, 'good-page.md'));
    expect(result.scores.total).toBeGreaterThan(0);
    expect(result.title).toContain('llms.txt');
  });
});

describe('scanDirectory', () => {
  it('scans all HTML and MD files in fixtures', async () => {
    const report = await scanDirectory(fixtures);
    expect(report.pages.length).toBeGreaterThanOrEqual(3);
    expect(report.overall.total).toBeGreaterThan(0);
    expect(report.summary).toContain('/100');
    expect(report.timestamp).toBeTruthy();
  });
});

describe('scan', () => {
  it('scans a single file target', async () => {
    const report = await scan({ type: 'file', path: join(fixtures, 'good-page.html') });

    expect(report.pages).toHaveLength(1);
    expect(report.overall.total).toBeGreaterThan(0);
    expect(report.summary).toContain('/100');
  });
});

describe('scanUrl', () => {
  it('rejects redirects to blocked private addresses', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === 'https://example.com/') {
        expect(init?.redirect).toBe('manual');
        return new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(scanUrl('https://example.com/')).rejects.toThrow('Scanning private/loopback addresses is not allowed.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
