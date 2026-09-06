import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditHtml, auditPath } from '../static-audit.js';

type StaticPageAudit = ReturnType<typeof auditHtml>;
type StaticAuditCheck = StaticPageAudit['checks'][number];

const checkIds = [
  'document-title',
  'meta-description',
  'canonical',
  'indexing-directives',
  'jsonld-syntax',
  'http-indexing',
] as const;

let ownedTempDir: string | undefined;

afterEach(async () => {
  if (ownedTempDir) {
    const path = ownedTempDir;
    ownedTempDir = undefined;
    await rm(path, { recursive: true, force: true });
  }
});

function getCheck(page: StaticPageAudit, id: string): StaticAuditCheck {
  const check = page.checks.find((candidate) => candidate.id === id);
  if (!check) throw new Error(`Missing static audit check: ${id}`);
  return check;
}

function findCheck(page: StaticPageAudit, id: string): StaticAuditCheck | undefined {
  return page.checks.find((candidate) => candidate.id === id);
}

function expectCheckContract(check: StaticAuditCheck): void {
  expect(['PASS', 'WARNING', 'FAIL', 'N/A']).toContain(check.status);
  expect(Array.isArray(check.evidence)).toBe(true);
  expect(check.evidence.every((item) => typeof item === 'string')).toBe(true);
  expect(typeof check.message).toBe('string');
  expect(check.message.length).toBeGreaterThan(0);
  expect(check.remediation === null || typeof check.remediation === 'string').toBe(true);
  expect(typeof check.validation).toBe('string');
}

function expectPageContract(page: StaticPageAudit, target: string): void {
  expect(page.target).toBe(target);
  expect(page.checks).toHaveLength(checkIds.length);
  expect(new Set(page.checks.map((check) => check.id))).toEqual(new Set(checkIds));
  page.checks.forEach(expectCheckContract);
}

function htmlPage({
  title = 'A static page',
  description = 'A page-specific description.',
  canonical = 'https://example.test/page',
  robots = 'index,follow',
  jsonLd = '',
  body = '<p>Readable page content.</p>',
}: {
  title?: string;
  description?: string | null;
  canonical?: string | null;
  robots?: string | null;
  jsonLd?: string;
  body?: string;
} = {}): string {
  const descriptionTag = description === null ? '' : `<meta name="description" content="${description}">`;
  const canonicalTag = canonical === null ? '' : `<link rel="canonical" href="${canonical}">`;
  const robotsTag = robots === null ? '' : `<meta name="robots" content="${robots}">`;
  return `<html><head><title>${title}</title>${descriptionTag}${canonicalTag}${robotsTag}${jsonLd}</head><body>${body}</body></html>`;
}

async function makeTempDir(): Promise<string> {
  ownedTempDir = await mkdtemp(join(tmpdir(), 'aeoptimize-static-audit-'));
  return ownedTempDir;
}

async function writeHtmlFile(path: string, html = htmlPage()): Promise<void> {
  await writeFile(path, html, 'utf8');
}

function jsonLdScript(payload: string): string {
  return `<script type="application/ld+json">${payload}</script>`;
}

describe('auditHtml', () => {
  it('returns the stable page contract for a complete static page', () => {
    const target = 'https://example.test/guide';
    const page = auditHtml(
      htmlPage({
        title: 'A useful guide',
        description: 'A concise description for the guide.',
        canonical: target,
        robots: 'index,follow',
        jsonLd: jsonLdScript('{"@context":"https://schema.org","@type":"Article"}'),
      }),
      target,
    );

    expectPageContract(page, target);
    expect(getCheck(page, 'document-title').status).toBe('PASS');
    expect(getCheck(page, 'meta-description').status).toBe('PASS');
    expect(getCheck(page, 'canonical').status).toBe('PASS');
    expect(getCheck(page, 'indexing-directives').status).toBe('PASS');
    expect(getCheck(page, 'jsonld-syntax').status).toBe('PASS');
    expect(getCheck(page, 'http-indexing').status).toBe('N/A');
  });

  it.each([
    ['missing title', '<head></head>'],
    ['empty title', '<head><title>   </title></head>'],
    ['multiple titles', '<head><title>First</title><title>Second</title></head>'],
  ])('warns when the document has %s', (_caseName, head) => {
    const page = auditHtml(`<html>${head}<body>Content</body></html>`, 'missing-title.html');
    expect(getCheck(page, 'document-title').status).toBe('WARNING');
  });

  it.each([
    ['no description', '<head><title>Page</title></head>'],
    ['an empty description', '<head><title>Page</title><meta name="description" content=" "></head>'],
    [
      'multiple descriptions',
      '<head><title>Page</title><meta name="description" content="One"><meta name="description" content="Two"></head>',
    ],
  ])('warns when the page has %s', (_caseName, head) => {
    const page = auditHtml(`<html>${head}<body>Content</body></html>`, 'missing-description.html');
    expect(getCheck(page, 'meta-description').status).toBe('WARNING');
  });

  it('distinguishes a missing canonical from an invalid or duplicated canonical', () => {
    const missing = auditHtml(htmlPage({ canonical: null }), 'missing-canonical.html');
    expect(getCheck(missing, 'canonical').status).toBe('WARNING');

    const duplicate = auditHtml(
      '<html><head><title>Page</title><meta name="description" content="Description"><link rel="canonical" href="https://example.test/one"><link rel="canonical" href="https://example.test/two"><meta name="robots" content="index"></head></html>',
      'duplicate-canonical.html',
    );
    expect(getCheck(duplicate, 'canonical').status).toBe('FAIL');
  });

  it.each([
    ['empty', ''],
    ['invalid', 'https://[not-a-valid-url'],
    ['non-http', 'javascript:alert(1)'],
  ])('fails for an %s canonical URL', (_caseName, canonical) => {
    const page = auditHtml(htmlPage({ canonical }), 'invalid-canonical.html');
    expect(getCheck(page, 'canonical').status).toBe('FAIL');
  });

  it('treats a relative canonical as N/A without a base URL and resolves it with one', () => {
    const relative = auditHtml(htmlPage({ canonical: '../canonical' }), 'relative.html');
    expect(getCheck(relative, 'canonical').status).toBe('N/A');

    const resolved = auditHtml(htmlPage({ canonical: '../canonical' }), 'relative.html', {
      baseUrl: 'https://example.test/docs/index.html',
    });
    expect(getCheck(resolved, 'canonical').status).toBe('PASS');
  });

  it('detects case-insensitive robots and googlebot noindex across repeated tags, with noindex taking precedence', () => {
    const html = '<html><head><title>Page</title><meta name="description" content="Description"><meta name="RoBoTs" content="index,follow"><meta name="GOOGLEBOT" content="NoIndex,nofollow"><meta name="robots" content="index"></head><body>Content</body></html>';
    const page = auditHtml(html, 'directives.html');
    const check = getCheck(page, 'indexing-directives');

    expect(check.status).toBe('WARNING');
    expect(check.evidence.join(' ')).toMatch(/noindex/i);

    const expectedIndexable = auditHtml(html, 'directives.html', { expectIndexable: true });
    expect(getCheck(expectedIndexable, 'indexing-directives').status).toBe('FAIL');
  });

  it('passes an observed index directive even when page text contains the word noindex', () => {
    const page = auditHtml(
      htmlPage({
        robots: 'INDEX,FOLLOW',
        body: '<p>This page explains the word noindex in a documentation example.</p>',
      }),
      'observed-directives.html',
      { expectIndexable: true },
    );

    expect(getCheck(page, 'indexing-directives').status).toBe('PASS');
  });

  it('does not treat max-image-preview:none as the standalone none directive', () => {
    const page = auditHtml(
      htmlPage({ robots: 'index,follow,max-image-preview:none' }),
      'image-preview-directive.html',
      { expectIndexable: true },
    );

    expect(getCheck(page, 'indexing-directives').status).toBe('PASS');
  });

  it('keeps spaced parameter values distinct from a standalone none token', () => {
    const preview = auditHtml(htmlPage({ robots: 'max-image-preview: none' }), 'page.html', { expectIndexable: true });
    expect(getCheck(preview, 'indexing-directives').status).toBe('PASS');
    const blocked = auditHtml(htmlPage({ robots: 'none' }), 'page.html', { expectIndexable: true });
    expect(getCheck(blocked, 'indexing-directives').status).toBe('FAIL');
  });

  it('resolves HTML base href without inventing a deployment origin', () => {
    const html = '<head><base href="/docs/"><link rel="canonical" href="guide"></head>';
    expect(getCheck(auditHtml(html, 'page.html'), 'canonical').status).toBe('N/A');
    const resolved = auditHtml(html, 'page.html', { baseUrl: 'https://example.test/page.html' });
    expect(getCheck(resolved, 'canonical').evidence).toEqual(['https://example.test/docs/guide']);
  });

  it('does not let an unusable HTML base invalidate an absolute canonical', () => {
    const html = '<head><base href="javascript:alert(1)"><link rel="canonical" href="https://example.test/page"></head>';
    expect(getCheck(auditHtml(html, 'page.html'), 'canonical').status).toBe('PASS');
  });

  it('reports N/A when no schema block is present', () => {
    const page = auditHtml(htmlPage({ jsonLd: '' }), 'https://example.test/page');

    expect(getCheck(page, 'jsonld-syntax').status).toBe('N/A');
  });

  it('keeps HTTP indexing out of scope for local HTML', () => {
    const page = auditHtml(htmlPage(), 'https://example.test/page', { expectIndexable: true });

    expect(getCheck(page, 'http-indexing').status).toBe('N/A');
  });

  it('fails when any JSON-LD block is malformed', () => {
    const page = auditHtml(htmlPage({ jsonLd: jsonLdScript('{"@context":') }), 'malformed-jsonld.html');
    expect(getCheck(page, 'jsonld-syntax').status).toBe('FAIL');
  });

  it.each([
    ['a null root', 'null'],
    ['a numeric root', '42'],
    ['a string root', '"text"'],
    ['an array containing a primitive', '[{"@type":"Thing"},1]'],
    ['an array containing null', '[null]'],
  ])('fails for JSON-LD with %s', (_caseName, payload) => {
    const page = auditHtml(htmlPage({ jsonLd: jsonLdScript(payload) }), 'primitive-jsonld.html');
    expect(getCheck(page, 'jsonld-syntax').status).toBe('FAIL');
  });

  it('passes JSON-LD objects, arrays of objects, and @graph without checking rich-result eligibility', () => {
    const jsonLd = [
      jsonLdScript('{"name":"A structurally valid object"}'),
      jsonLdScript('[{"@type":"Thing"},{"@type":"WebPage"}]'),
      jsonLdScript('{"@context":"https://schema.org","@type":"NotARealSchemaType","@graph":[{"name":"Nested object"}]}'),
    ].join('');
    const page = auditHtml(htmlPage({ jsonLd }), 'valid-jsonld.html');

    expect(getCheck(page, 'jsonld-syntax').status).toBe('PASS');
  });
});

describe('auditPath', () => {
  it('audits .html and .htm files while rejecting unsupported file types', async () => {
    const root = await makeTempDir();
    const htmlPath = join(root, 'index.html');
    const htmPath = join(root, 'legacy.htm');
    const textPath = join(root, 'notes.txt');
    await Promise.all([
      writeHtmlFile(htmlPath),
      writeHtmlFile(htmPath),
      writeFile(textPath, 'not HTML', 'utf8'),
    ]);

    const htmlReport = await auditPath(htmlPath);
    const htmReport = await auditPath(htmPath);
    expect(htmlReport.pages).toHaveLength(1);
    expect(htmReport.pages).toHaveLength(1);
    expect(htmlReport.pages[0].target).toBe(htmlPath);
    expect(htmReport.pages[0].target).toBe(htmPath);
    expect(htmlReport.source).toBe('local-html');
    expect(htmlReport.contractVersion).toBe('1.0');
    await expect(auditPath(textPath)).rejects.toThrow();
  });

  it('recurses in deterministic path order and skips node_modules, dot directories, and symlinks', async () => {
    const root = await makeTempDir();
    const nested = join(root, 'a');
    const deep = join(root, 'z');
    await mkdir(nested, { recursive: true });
    await mkdir(deep, { recursive: true });
    await mkdir(join(root, 'node_modules', 'dependency'), { recursive: true });
    await mkdir(join(root, '.hidden'), { recursive: true });

    const expectedFiles = [
      join(nested, 'first.htm'),
      join(nested, 'second.html'),
      join(root, 'root.html'),
      join(deep, 'last.html'),
    ];
    await Promise.all(expectedFiles.map((path) => writeHtmlFile(path)));
    await writeHtmlFile(join(root, 'node_modules', 'dependency', 'ignored.html'));
    await writeHtmlFile(join(root, '.hidden', 'ignored.html'));
    const realFile = join(root, 'real.html');
    const symlinkPath = join(root, 'linked.html');
    await writeHtmlFile(realFile);
    await symlink(realFile, symlinkPath, 'file');

    const report = await auditPath(root);
    expect(report.pages.map((page) => page.target)).toEqual([...expectedFiles, realFile].sort());
    expect(report.pages.some((page) => page.target.includes(`${join(root, 'node_modules')}/`))).toBe(false);
    expect(report.pages.some((page) => page.target.includes(`${join(root, '.hidden')}/`))).toBe(false);
    expect(report.pages.some((page) => page.target === symlinkPath)).toBe(false);
    await expect(auditPath(symlinkPath)).rejects.toThrow();
  });

  it('rejects a directory that contains no HTML files', async () => {
    const root = await makeTempDir();
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(join(root, 'nested', 'notes.md'), 'No HTML here', 'utf8');

    await expect(auditPath(root)).rejects.toThrow();
  });

  it('reports duplicate titles and canonical URLs only on affected directory pages', async () => {
    const root = await makeTempDir();
    const pages = [
      [
        'title-a.html',
        htmlPage({ title: '  Shared Topic  ', canonical: 'https://example.test/title-a' }),
      ],
      [
        'title-b.html',
        htmlPage({ title: 'shared topic', canonical: 'https://example.test/title-b' }),
      ],
      [
        'canonical-a.html',
        htmlPage({ title: 'Canonical A', canonical: 'https://example.test/guide?topic=seo#first' }),
      ],
      [
        'canonical-b.html',
        htmlPage({ title: 'Canonical B', canonical: '/guide?topic=seo#second' }),
      ],
      [
        'canonical-different-query.html',
        htmlPage({ title: 'Canonical C', canonical: '/guide?topic=other#fragment' }),
      ],
    ] as const;
    await Promise.all(pages.map(([name, html]) => writeHtmlFile(join(root, name), html)));

    const report = await auditPath(root, { baseUrl: 'https://example.test/' });
    const pageByName = new Map(report.pages.map((page) => [basename(page.target), page]));
    const titleA = pageByName.get('title-a.html');
    const titleB = pageByName.get('title-b.html');
    const canonicalA = pageByName.get('canonical-a.html');
    const canonicalB = pageByName.get('canonical-b.html');
    const differentQuery = pageByName.get('canonical-different-query.html');

    expect(titleA && findCheck(titleA, 'duplicate-document-title')?.status).toBe('WARNING');
    expect(titleB && findCheck(titleB, 'duplicate-document-title')?.status).toBe('WARNING');
    expect(canonicalA && findCheck(canonicalA, 'duplicate-canonical')?.status).toBe('WARNING');
    expect(canonicalB && findCheck(canonicalB, 'duplicate-canonical')?.status).toBe('WARNING');
    expect(differentQuery && findCheck(differentQuery, 'duplicate-canonical')).toBeUndefined();
    expect(differentQuery && findCheck(differentQuery, 'duplicate-document-title')).toBeUndefined();

    const summary = report.pages.flatMap((page) => page.checks).reduce<Record<string, number>>((counts, check) => {
      counts[check.status] = (counts[check.status] ?? 0) + 1;
      return counts;
    }, {});
    expect(report.summary).toEqual({
      PASS: summary.PASS ?? 0,
      WARNING: summary.WARNING ?? 0,
      FAIL: summary.FAIL ?? 0,
      'N/A': summary['N/A'] ?? 0,
    });
    expect(report.limitations).toEqual(expect.any(Array));
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });

  it('keeps same-page duplicate canonical tags in the canonical check without adding a directory duplicate', async () => {
    const root = await makeTempDir();
    const pagePath = join(root, 'same-page.html');
    await writeHtmlFile(
      pagePath,
      '<html><head><title>One page</title><meta name="description" content="Description"><link rel="canonical" href="https://example.test/one"><link rel="canonical" href="https://example.test/one"><meta name="robots" content="index"></head><body>Content</body></html>',
    );

    const report = await auditPath(root);
    expect(report.pages).toHaveLength(1);
    expect(getCheck(report.pages[0], 'canonical').status).toBe('FAIL');
    expect(findCheck(report.pages[0], 'duplicate-canonical')).toBeUndefined();
  });
});
