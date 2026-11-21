import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, generateLlmsTxt, generateLlmsFullTxt, generateJsonLd, generateRobotsTxtSuggestions } from '../generator.js';
import { parseHtml, scanDocument } from '../scanner.js';
import type { SiteInfo, ScanReport, ParsedDocument } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures');

const siteInfo: SiteInfo = {
  name: 'GEO Guide',
  description: 'Learn about Generative Engine Optimization',
  baseUrl: 'https://example.com',
};

describe('generateLlmsTxt', () => {
  it('produces valid llms.txt format', () => {
    const report: ScanReport = {
      pages: [
        { url: 'https://example.com/guide', title: 'GEO Guide', scores: { structure: 20, citability: 20, schema: 15, aiMetadata: 10, contentDensity: 10, total: 75 }, issues: [], suggestions: [] },
      ],
      overall: { structure: 20, citability: 20, schema: 15, aiMetadata: 10, contentDensity: 10, total: 75 },
      summary: 'Good',
      timestamp: '2026-04-07T00:00:00Z',
    };

    const result = generateLlmsTxt(report, siteInfo);

    expect(result).toContain('# GEO Guide');
    expect(result).toContain('> Learn about Generative Engine Optimization');
    expect(result).toContain('## Pages');
    expect(result).toContain('[GEO Guide](https://example.com/guide)');
  });

  it('handles empty pages', () => {
    const report: ScanReport = {
      pages: [],
      overall: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      summary: 'No pages',
      timestamp: '2026-04-07T00:00:00Z',
    };

    const result = generateLlmsTxt(report, siteInfo);
    expect(result).toContain('# GEO Guide');
    expect(result).not.toContain('## Pages');
  });
});

describe('generateLlmsFullTxt', () => {
  it('includes page content', async () => {
    const html = await readFile(join(fixtures, 'good-page.html'), 'utf-8');
    const doc = parseHtml(html, 'https://example.com/geo');
    const report: ScanReport = {
      pages: [scanDocument(doc)],
      overall: scanDocument(doc).scores,
      summary: 'Test',
      timestamp: '2026-04-07T00:00:00Z',
    };

    const result = generateLlmsFullTxt(report, [doc]);
    expect(result).toContain('## What is Generative Engine Optimization');
    expect(result).toContain('---');
  });

  it('truncates rawText longer than 5000 chars and notes the total', () => {
    const doc = {
      title: 'Long Page',
      rawText: 'x'.repeat(6000),
    } as ParsedDocument;
    const report: ScanReport = {
      pages: [],
      overall: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      summary: 'Test',
      timestamp: '2026-04-07T00:00:00Z',
    };

    const result = generateLlmsFullTxt(report, [doc]);
    expect(result).toContain('Content truncated: 6000 chars total, showing first 5000');
    expect(result).not.toContain('x'.repeat(5001));
  });
});

describe('generateJsonLd', () => {
  it('generates Article schema for article-like content without existing schema', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'Test Article',
      html: '<article><h1>Test Article</h1><h2>Section One</h2><p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p></article>',
      headings: [
        { level: 1, text: 'Test Article' },
        { level: 2, text: 'Section One' },
      ],
      paragraphs: ['First paragraph.', 'Second paragraph.', 'Third paragraph.'],
      jsonLd: [],
      metaTags: { description: 'A test article', author: 'Jane', 'article:published_time': '2026-08-15' },
      links: [],
      rawText: 'Test content.',
    };

    const result = generateJsonLd(doc);
    const article = result.find((r: any) => r['@type'] === 'Article') as any;
    expect(article).toBeTruthy();
    expect(article.name).toBe('Test Article');
    expect(article.author.name).toBe('Jane');
  });

  it('does not infer Article schema without explicit article metadata', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'Generic Page',
      html: '<main><h1>Generic Page</h1><h2>Details</h2></main>',
      headings: [
        { level: 1, text: 'Generic Page' },
        { level: 2, text: 'Details' },
      ],
      paragraphs: ['First paragraph.', 'Second paragraph.', 'Third paragraph.'],
      jsonLd: [],
      metaTags: {},
      links: [],
      rawText: 'Generic content.',
    };

    expect(generateJsonLd(doc).some((item: any) => item['@type'] === 'Article')).toBe(false);
  });

  it('does not infer FAQPage schema from question headings', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'FAQ',
      headings: [
        { level: 1, text: 'FAQ' },
        { level: 2, text: 'What is GEO?' },
        { level: 2, text: 'How does it work?' },
      ],
      paragraphs: ['Intro.', 'GEO is generative engine optimization.', 'It works by restructuring content.'],
      jsonLd: [],
      metaTags: {},
      links: [],
      rawText: 'Test',
    };

    const result = generateJsonLd(doc);
    const faq = result.find((r: any) => r['@type'] === 'FAQPage');
    expect(faq).toBeUndefined();
  });

  it('does not duplicate existing schema types', async () => {
    const html = await readFile(join(fixtures, 'good-page.html'), 'utf-8');
    const doc = parseHtml(html, 'test');
    const result = generateJsonLd(doc);

    // Existing Article/BreadcrumbList are not duplicated; FAQPage is not inferred.
    const types = result.map((r: any) => r['@type']);
    expect(types).not.toContain('Article');
    expect(types).not.toContain('FAQPage');
    expect(types).not.toContain('BreadcrumbList');
  });

  it('builds a BreadcrumbList from internal nav links', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'Nav Page',
      headings: [],
      paragraphs: [],
      jsonLd: [],
      metaTags: {},
      links: [
        { href: '/docs', text: 'Docs' },
        { href: '/docs/start', text: 'Getting started' },
      ],
      rawText: 'Test',
    };

    const result = generateJsonLd(doc);
    const breadcrumb = result.find((r: any) => r['@type'] === 'BreadcrumbList') as any;
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb.itemListElement).toHaveLength(2);
    expect(breadcrumb.itemListElement[0]).toMatchObject({ position: 1, name: 'Docs', item: '/docs' });
  });

  it('excludes protocol-relative and external links from breadcrumbs', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'Nav Page',
      headings: [],
      paragraphs: [],
      jsonLd: [],
      metaTags: {},
      links: [
        { href: '//cdn.example.com/x', text: 'CDN asset' },
        { href: 'https://example.com/page', text: 'Absolute link' },
        { href: '/real', text: 'Real' },
        { href: '/two', text: 'Two' },
      ],
      rawText: 'Test',
    };

    const result = generateJsonLd(doc);
    const breadcrumb = result.find((r: any) => r['@type'] === 'BreadcrumbList') as any;
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb.itemListElement.map((i: any) => i.item)).toEqual(['/real', '/two']);
  });

  it('requires at least two nav links before generating a BreadcrumbList', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'Nav Page',
      headings: [],
      paragraphs: [],
      jsonLd: [],
      metaTags: {},
      links: [{ href: '/only', text: 'Only' }],
      rawText: 'Test',
    };

    expect(generateJsonLd(doc).some((r: any) => r['@type'] === 'BreadcrumbList')).toBe(false);
  });

  it('caps breadcrumb items at five', () => {
    const doc: ParsedDocument = {
      url: 'test',
      title: 'Nav Page',
      headings: [],
      paragraphs: [],
      jsonLd: [],
      metaTags: {},
      links: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ href: `/p${n}`, text: `Page ${n}` })),
      rawText: 'Test',
    };

    const breadcrumb = generateJsonLd(doc).find((r: any) => r['@type'] === 'BreadcrumbList') as any;
    expect(breadcrumb.itemListElement).toHaveLength(5);
    expect(breadcrumb.itemListElement[4].item).toBe('/p5');
  });
});

describe('generateRobotsTxtSuggestions', () => {
  it('suggests all AI crawlers when no existing robots.txt', () => {
    const result = generateRobotsTxtSuggestions(null);
    const text = result.join('\n');

    expect(text).toContain('GPTBot');
    expect(text).toContain('ClaudeBot');
    expect(text).toContain('PerplexityBot');
    expect(text).toContain('Allow: /');
  });

  it('skips already configured crawlers', () => {
    const existing = 'User-agent: GPTBot\nAllow: /\n';
    const result = generateRobotsTxtSuggestions(existing);
    const text = result.join('\n');

    // GPTBot already configured, should not appear again
    const gptBotLines = result.filter((l) => l.includes('User-agent: GPTBot'));
    expect(gptBotLines.length).toBe(0);

    // Others should still appear
    expect(text).toContain('ClaudeBot');
  });

  it('matches existing crawler rules case-insensitively', () => {
    const existing = 'user-agent: gptbot\nAllow: /\n';
    const text = generateRobotsTxtSuggestions(existing).join('\n');
    expect(text).not.toContain('User-agent: GPTBot');
    expect(text).toContain('ClaudeBot');
  });

  it('does not claim that robots.txt should point crawlers to llms.txt', () => {
    const text = generateRobotsTxtSuggestions(null).join('\n');
    expect(text).not.toContain('llms.txt');
    expect(text).not.toContain('rel="llms-txt"');
  });
});

describe('generate', () => {
  it('assembles all four output sections', () => {
    const report: ScanReport = {
      pages: [],
      overall: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      summary: 'Test',
      timestamp: '2026-04-07T00:00:00Z',
    };

    const result = generate(report, [], siteInfo, 'User-agent: GPTBot\nAllow: /');
    expect(result.llmsTxt).toContain('# GEO Guide');
    expect(result.llmsFullTxt).toBe('');
    expect(result.jsonLd).toEqual([]);
    expect(result.robotsTxtSuggestions.join('\n')).not.toContain('User-agent: GPTBot');
    expect(result.robotsTxtSuggestions.join('\n')).toContain('ClaudeBot');
  });
});
