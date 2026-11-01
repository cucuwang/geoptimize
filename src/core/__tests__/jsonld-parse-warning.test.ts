import { describe, expect, it } from 'vitest';
import { allRules } from '../rules.js';
import { parseHtml, scanDocument } from '../scanner.js';
import type { ParsedDocument } from '../types.js';

const rule = allRules.find((candidate) => candidate.id === 'json-ld-presence')!;
const block = (content: string) => `<script type="application/ld+json">${content}</script>`;
const valid = '{"@context":"https://schema.org","@type":"Article","name":"Test"}';
const absentMessage = 'No JSON-LD structured data found';

function expectParseWarning(doc: ParsedDocument) {
  const result = rule.evaluate(doc);
  const warning = {
    dimension: 'schema',
    severity: 'warning',
    message: `JSON-LD could not be parsed: ${doc.jsonLdErrors!.join('; ')}. This warning does not change the readiness score; fix the block and run audit-build to check structured data syntax.`,
  };
  expect(doc.jsonLdErrors!.length).toBeGreaterThan(0);
  expect(result).toEqual({ score: 8, maxScore: 8, issues: [warning], suggestions: [] });
  const page = scanDocument(doc);
  expect(page.issues).toContainEqual(warning);
  expect(page.issues.some((issue) => issue.message.includes(absentMessage))).toBe(false);
  return page;
}

describe('JSON-LD parse warnings', () => {
  it('warns for a malformed block while preserving full schema points', () => {
    const doc = parseHtml(block('{"@type":"Article",}'), 'test.html');
    expect(doc.jsonLd).toEqual([]);
    expect(expectParseWarning(doc).scores.schema).toBe(20);
  });

  it('warns for a malformed block alongside a valid block without changing scores', () => {
    const doc = parseHtml(block(valid) + block('{'), 'test.html');
    expect(doc.jsonLd).toHaveLength(1);
    expect(doc.jsonLdErrors![0]).toContain('JSON-LD block 2:');
    expect(expectParseWarning(doc).scores).toEqual(scanDocument(parseHtml(block(valid), 'test.html')).scores);
  });

  it('joins multiple parsing errors into one warning', () => {
    const doc = parseHtml(block('{') + block('}'), 'test.html');
    expect(doc.jsonLdErrors).toHaveLength(2);
    expect(expectParseWarning(doc).scores.schema).toBe(20);
  });

  it('keeps the optional-data info issue when there are no JSON-LD blocks', () => {
    const doc = parseHtml('<h1>Test</h1>', 'test.html');
    const result = rule.evaluate(doc);
    expect(result.score).toBe(8);
    expect(result.maxScore).toBe(8);
    expect(result.issues).toEqual([{
      dimension: 'schema',
      severity: 'info',
      message: 'No JSON-LD structured data found. Add a supported type only when it matches visible content and serves a defined search feature.',
    }]);
    expect(scanDocument(doc).scores.schema).toBe(20);
  });

  it('preserves the non-object value and its v0.6 schema score while warning', () => {
    const doc = parseHtml(block('42'), 'test.html');
    expect(doc.jsonLd).toEqual([42]);
    expect(doc.jsonLdErrors).toEqual(['JSON-LD block 1: expected an object']);
    expect(expectParseWarning(doc).scores.schema).toBe(8);
  });

  it('does not report missing JSON-LD for an existing empty array block', () => {
    const doc = parseHtml(block('[]'), 'test.html');
    expect(rule.evaluate(doc).issues).toEqual([]);
  });

  it('falls back to parsed values when the block count is undefined', () => {
    const doc = parseHtml(block(valid), 'test.html');
    delete doc.jsonLdBlockCount;
    delete doc.jsonLdErrors;
    expect(rule.evaluate(doc).issues).toEqual([]);
    doc.jsonLd = [];
    expect(rule.evaluate(doc).issues).toHaveLength(1);
    expect(rule.evaluate(doc).issues[0].severity).toBe('info');
  });
});
