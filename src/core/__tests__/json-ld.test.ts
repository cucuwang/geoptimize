import { describe, expect, it } from 'vitest';
import { parseHtml, scanDocument } from '../scanner.js';
import { auditDocument } from '../audit.js';
import { auditHtml } from '../static-audit.js';

function page(payload: string, type = 'application/ld+json'): string {
  return `<html>\n<head>\n<title>Fixture</title>\n<script type="${type}">${payload}</script>\n</head>\n<body><h1>Fixture</h1></body></html>`;
}

describe('JSON-LD structural diagnostics across scan and audits', () => {
  it.each([
    ['malformed JSON', '{"@context":', /malformed JSON/],
    ['missing context', '{"@type":"Thing"}', /missing fields: @context/],
    ['missing type', '{"@context":"https://schema.org"}', /missing fields: @type/],
    ['missing both fields', '{}', /missing fields: @context, @type/],
    ['numeric context', '{"@context":42,"@type":"Thing"}', /@context must be/],
    ['boolean context', '{"@context":false,"@type":"Thing"}', /@context must be/],
    ['invalid context array', '{"@context":[42],"@type":"Thing"}', /@context must be/],
    ['numeric type', '{"@context":"https://schema.org","@type":42}', /@type must be/],
    ['boolean type', '{"@context":"https://schema.org","@type":false}', /@type must be/],
    ['object type', '{"@context":"https://schema.org","@type":{}}', /@type must be/],
    ['non-coercible type', '{"@type":{"toString":{}}}', /@type must be/],
    ['mixed type array', '{"@context":"https://schema.org","@type":["Thing",42]}', /@type must be/],
    ['empty type array', '{"@context":"https://schema.org","@type":[]}', /@type must be/],
    ['blank type', '{"@context":"https://schema.org","@type":" "}', /@type must be/],
    ['null root', 'null', /expected an object/],
    ['primitive root', '42', /expected an object/],
    ['invalid graph node', '{"@context":"https://schema.org","@graph":[42]}', /expected an object/],
    ['untyped graph node', '{"@context":"https://schema.org","@graph":[{"name":"Thing"}]}', /missing fields: @type/],
    ['nested array', '[[{"@context":"https://schema.org","@type":"Thing"}]]', /nested array/],
  ])('reports %s with source locations', (_name, payload, message) => {
    const html = page(payload);
    const doc = parseHtml(html, 'dist/broken.html');
    const scan = scanDocument(doc, { details: true });
    expect(scan.url).toBe('dist/broken.html');
    expect(scan.issues).toContainEqual(expect.objectContaining({ dimension: 'schema', message: expect.stringMatching(message), line: 4 }));
    expect(scan.ruleResults?.find(rule => rule.id === 'json-ld-completeness')?.issues)
      .toContainEqual(expect.objectContaining({ message: expect.stringMatching(message), line: 4 }));

    const audit = auditDocument(doc, { target: { type: 'file', input: doc.url }, rendering: 'local-html' });
    const check = audit.checks.find(check => check.id === 'json-ld-structure')!;
    expect(audit.target.input).toBe('dist/broken.html');
    expect(check.status).toBe('FAIL');
    expect(JSON.stringify(check.evidence)).toContain('Line 4, block 1, $');
    expect(JSON.stringify(check.evidence)).toMatch(message);

    const built = auditHtml(html, doc.url);
    expect(built.target).toBe('dist/broken.html');
    expect(built.checks.find(check => check.id === 'jsonld-syntax')).toMatchObject({ status: ['malformed JSON', 'null root', 'primitive root', 'nested array'].includes(_name) ? 'FAIL' : 'WARNING' });
    expect(built.checks.find(check => check.id === 'jsonld-syntax')?.evidence.join('\n')).toContain('Line 4, block 1, $');
    expect(built.checks.find(check => check.id === 'jsonld-syntax')?.evidence.join('\n')).toMatch(message);
  });

  it.each([
    { '@context': 'https://schema.org', '@type': 'Thing' },
    [{ '@context': 'https://schema.org', '@type': 'Thing' }],
    { '@context': { '@vocab': 'https://schema.org/' }, '@type': ['Thing', 'WebPage'] },
    { '@context': ['https://schema.org', { name: 'https://schema.org/name' }], '@type': 'Thing' },
    { '@context': 'https://schema.org', '@graph': [{ '@type': 'Thing', author: { name: 'Nested objects need no context' } }] },
    { '@context': 'https://schema.org', '@graph': [{ '@graph': [{ '@type': 'Thing' }] }] },
    { '@context': 'https://schema.org', '@graph': [] },
  ])('accepts valid structures including inherited context and multiple types', value => {
    const html = page(JSON.stringify(value));
    const doc = parseHtml(html, 'valid.html');
    expect(doc.jsonLdDiagnostics).toEqual([]);
    expect(scanDocument(doc).issues.filter(issue => issue.dimension === 'schema')).toEqual([]);
    expect(auditDocument(doc, { target: { type: 'file', input: doc.url }, rendering: 'local-html' })
      .checks.find(check => check.id === 'json-ld-structure')?.status).toBe('PASS');
    expect(auditHtml(html, doc.url).checks.find(check => check.id === 'jsonld-syntax')?.status).toBe('PASS');
  });

  it('keeps missing structured data optional and preserves historical readiness points for malformed JSON', () => {
    const absent = parseHtml('<h1>Fixture</h1>', 'absent.html');
    const malformed = parseHtml('<h1>Fixture</h1><script type="application/ld+json">{</script>', 'broken.html');
    expect(absent.jsonLdDiagnostics).toEqual([]);
    expect(scanDocument(malformed).scores.schema).toBe(scanDocument(absent).scores.schema);
    expect(scanDocument(malformed).issues.some(issue => /malformed JSON/.test(issue.message))).toBe(true);
    expect(scanDocument(malformed).issues.some(issue => /No JSON-LD/.test(issue.message))).toBe(false);
    expect(auditHtml('<h1>Fixture</h1>', 'absent.html').checks.find(check => check.id === 'jsonld-syntax')?.status).toBe('N/A');
  });

  it('normalizes MIME case and whitespace, counts real blocks and reports the failing graph path', () => {
    const html = '<!-- <script type="application/ld+json">{</script> -->\n'
      + '<script>const x = 1;</script>\n'
      + '<script type=" APPLICATION/LD+JSON ">{"@context":"https://schema.org","@type":"Thing"}</script>\n'
      + '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":42}]}</script>';
    const doc = parseHtml(html, 'multiple.html');
    expect(doc.jsonLdBlockCount).toBe(2);
    expect(doc.jsonLdDiagnostics).toEqual([
      expect.objectContaining({ line: 4, block: 2, path: '$.@graph[0].@type' }),
    ]);
  });
});
