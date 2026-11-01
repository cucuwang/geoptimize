import { describe, expect, it } from 'vitest';
import { formatJsonLdDiagnostic, parseJsonLdBlocks } from '../json-ld.js';
import { allRules } from '../rules.js';
import type { ParsedDocument } from '../types.js';

const parse = (value: unknown) => parseJsonLdBlocks([{ source: JSON.stringify(value), line: 17 }]);

describe('JSON-LD block validation', () => {
  it('retains syntax errors as positioned findings even when no entity could be parsed', () => {
    const result = parseJsonLdBlocks([{ source: '{"@context":', line: 17 }]);
    expect(result.jsonLd).toEqual([]);
    expect(result.jsonLdBlockCount).toBe(1);
    expect(result.jsonLdErrors).toHaveLength(1);
    expect(result.jsonLdDiagnostics).toEqual([
      expect.objectContaining({ message: expect.stringContaining('malformed JSON'), line: 17, block: 1, path: '$', severity: 'warning' }),
    ]);
    expect(formatJsonLdDiagnostic(result.jsonLdDiagnostics[0])).toContain('Line 17, block 1, $:');
  });

  it.each([
    [{}, /missing fields: @context, @type/],
    [{ '@type': 'Thing' }, /missing fields: @context/],
    [{ '@context': 'https://schema.org' }, /missing fields: @type/],
    [{ '@context': 42, '@type': 'Thing' }, /@context must be/],
    [{ '@context': false, '@type': 'Thing' }, /@context must be/],
    [{ '@context': [], '@type': 'Thing' }, /@context must be/],
    [{ '@context': [42], '@type': 'Thing' }, /@context must be/],
    [{ '@context': 'https://schema.org', '@type': 42 }, /@type must be/],
    [{ '@context': 'https://schema.org', '@type': false }, /@type must be/],
    [{ '@context': 'https://schema.org', '@type': ['Thing', null] }, /@type must be/],
    [{ '@context': 'https://schema.org', '@type': [] }, /@type must be/],
    [{ '@context': 'https://schema.org', '@type': ' ' }, /@type must be/],
    [{ '@type': { toString: {} } }, /@type must be/],
    [null, /expected an object/],
    [42, /expected an object/],
    [[{}], /missing fields/],
    [[[]], /nested array/],
  ])('detects invalid structure %j', (value, message) => {
    const result = parse(value);
    expect(result.jsonLdDiagnostics).toContainEqual(expect.objectContaining({ message: expect.stringMatching(message), line: 17, block: 1 }));
  });

  it('preserves context inheritance, graph envelopes and arrays of types', () => {
    const context = ['https://schema.org', { name: 'https://schema.org/name' }];
    const result = parse({ '@context': context, '@graph': [
      { '@type': ['Thing', 'WebPage'], author: { name: 'Fixture author' } },
      { '@graph': [{ '@type': 'Article', author: { name: 'Fixture author' }, datePublished: '2026-10-23' }] },
    ] });
    expect(result.jsonLdDiagnostics).toEqual([]);
    expect(result.jsonLdErrors).toEqual([]);
    expect(result.jsonLd.map(node => node['@context'])).toEqual([context, context]);
    expect(result.jsonLd).toHaveLength(2);
  });

  it('keeps invalid graph entries with block and node paths', () => {
    const result = parseJsonLdBlocks([
      { source: '{"@context":"https://schema.org","@type":"Thing"}', line: 3 },
      { source: '{"@context":"https://schema.org","@graph":[{"@type":42},null]}', line: 17 },
    ]);
    expect(result.jsonLdDiagnostics).toEqual([
      expect.objectContaining({ line: 17, block: 2, path: '$.@graph[0].@type' }),
      expect.objectContaining({ line: 17, block: 2, path: '$.@graph[1]' }),
    ]);
  });

  it('exposes new diagnostics through the existing scoring rule without changing its points', () => {
    const rule = allRules.find(rule => rule.id === 'json-ld-completeness')!;
    for (const source of ['{', '{"@context":"https://schema.org","@type":42}']) {
      const parsed = parseJsonLdBlocks([{ source, line: 17 }]);
      const doc: ParsedDocument = { url: 'fixture.html', title: 'Fixture', headings: [], paragraphs: [], metaTags: {}, links: [], rawText: '', ...parsed };
      const result = rule.evaluate(doc);
      expect(result.issues.some(issue => issue.line === 17)).toBe(true);
      const legacy = rule.evaluate({ ...doc, jsonLdDiagnostics: undefined });
      expect(result.score).toBe(legacy.score);
    }
  });

  it('does not coerce invalid type objects during Article review', () => {
    const parsed = parse({ '@type': { toString: {} } });
    const doc: ParsedDocument = { url: 'fixture.html', title: 'Fixture', headings: [], paragraphs: [], metaTags: {}, links: [], rawText: '', ...parsed };
    const result = allRules.find(rule => rule.id === 'json-ld-completeness')!.evaluate(doc);
    expect(result.score).toBe(6);
    expect(result.issues.some(issue => /@type must be/.test(issue.message))).toBe(true);
  });

  it('reports excessive nesting instead of throwing out the entire scan', () => {
    const result = parseJsonLdBlocks([{ source: '['.repeat(10000) + '{}' + ']'.repeat(10000), line: 17 }]);
    expect(result.jsonLdErrors.length).toBeGreaterThan(0);
    expect(result.jsonLdDiagnostics.some(diagnostic => /structure could not be inspected/.test(diagnostic.message))).toBe(true);
  });
});
