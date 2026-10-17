import { describe, expect, it } from 'vitest';
import { allRules } from '../rules.js';
import { parseHtml, scanDocument, SCORING_VERSION } from '../scanner.js';
import { generateJsonLd } from '../generator.js';
import { auditDocument } from '../audit.js';
import { auditHtml } from '../static-audit.js';
import { compareReadiness } from '../readiness-comparison.js';
import { parseScanReport, renderVisualReport } from '../visual-report.js';
import type { ParsedDocument, ScanReport } from '../types.js';

const evaluate = (id: string, doc: ParsedDocument) => allRules.find(rule => rule.id === id)!.evaluate(doc);
const jsonLdPage = (value: unknown) => parseHtml(`<head><script type="application/ld+json">${JSON.stringify(value)}</script></head><body></body>`, 'fixture.html');

const article = { '@type': 'Article', author: { '@type': 'Person', name: 'Jane' }, datePublished: '2026-10-18' };

describe('JSON-LD graph normalization', () => {
  it.each([
    { '@context': 'https://schema.org', '@graph': [article, { '@type': 'WebPage' }] },
    [{ '@context': 'https://schema.org', ...article }, { '@context': 'https://schema.org', '@type': 'WebPage' }],
    [{ '@context': 'https://schema.org', '@graph': [article, { '@type': 'WebPage' }] }],
  ])('makes graph and array nodes available to all consumers', value => {
    const doc = jsonLdPage(value);
    expect(doc.jsonLd).toHaveLength(2);
    expect(doc.jsonLdBlockCount).toBe(1);
    expect(doc.jsonLdErrors).toEqual([]);
    expect(evaluate('json-ld-presence', doc).score).toBe(8);
    expect(evaluate('json-ld-completeness', doc)).toMatchObject({ score: 12, issues: [], suggestions: [] });
    expect(evaluate('attribution', doc).score).toBe(4);
    const report = auditDocument(doc, { target: { type: 'file', input: doc.url }, rendering: 'local-html' });
    const check = report.checks.find(check => check.id === 'json-ld-structure');
    expect(check?.status).toBe('PASS');
    expect(JSON.stringify(check?.evidence)).toContain('Article');
    expect(JSON.stringify(check?.evidence)).toContain('WebPage');
    expect(JSON.stringify(check?.evidence)).toContain('"blockCount":1');
  });

  it('reports a graph node missing its type but inherits the envelope context', () => {
    const doc = jsonLdPage({ '@context': 'https://schema.org', '@graph': [{ name: 'Untyped entity' }] });
    expect(evaluate('json-ld-completeness', doc)).toMatchObject({
      score: 6, issues: [{ message: 'JSON-LD (unknown) missing fields: @type' }],
    });
  });

  it('checks author and publication date on Article nodes inside a graph', () => {
    const doc = jsonLdPage({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Article' }] });
    expect(evaluate('json-ld-completeness', doc).suggestions.map(suggestion => suggestion.action)).toEqual([
      'Add author field to Article schema', 'Add datePublished to Article schema',
    ]);
  });

  it('retains typed graph wrappers, nested graphs, and explicit child contexts', () => {
    const doc = jsonLdPage({ '@context': 'https://schema.org', '@type': 'Organization', '@graph': [
      { '@graph': [{ '@type': 'WebPage' }] },
      { '@context': 'https://example.com/vocab', '@type': 'Thing' },
    ] });
    expect(doc.jsonLd.map(node => node['@type'])).toEqual(['Organization', 'WebPage', 'Thing']);
    expect(doc.jsonLd.map(node => node['@context'])).toEqual(['https://schema.org', 'https://schema.org', 'https://example.com/vocab']);
  });

  it('keeps malformed graph nodes visible to structural auditing', () => {
    const doc = jsonLdPage({ '@context': 'https://schema.org', '@graph': [article, null, 42] });
    expect(doc.jsonLdErrors).toHaveLength(2);
    expect(auditDocument(doc, { target: { type: 'file', input: doc.url }, rendering: 'local-html' })
      .checks.find(check => check.id === 'json-ld-structure')?.status).toBe('FAIL');
  });

  it('does not generate schemas that already exist inside a graph', () => {
    const doc = jsonLdPage({ '@context': 'https://schema.org', '@graph': [article, { '@type': 'BreadcrumbList' }] });
    doc.html = '<article></article>';
    doc.headings = [{ level: 1, text: 'Guide' }, { level: 2, text: 'Details' }];
    doc.paragraphs = ['First paragraph', 'Second paragraph', 'Third paragraph'];
    doc.metaTags = { author: 'Jane', date: '2026-10-18' };
    doc.links = [{ href: '/one', text: 'One' }, { href: '/two', text: 'Two' }];
    expect(generateJsonLd(doc)).toEqual([]);
  });
});

describe('document titles with inline SVG', () => {
  it.each([true, false])('excludes SVG titles with a document title present=%s', hasTitle => {
    const html = `<html><head>${hasTitle ? '<title>Document title</title>' : ''}</head><body><svg><title>Icon title</title></svg><h1>Visible heading</h1></body></html>`;
    const doc = parseHtml(html, 'fixture.html');
    expect(doc.documentTitle).toBe(hasTitle ? 'Document title' : '');
    expect(doc.title).toBe(hasTitle ? 'Document title' : 'Visible heading');
    const check = auditHtml(html, 'fixture.html').checks.find(check => check.id === 'document-title');
    expect(check?.status).toBe(hasTitle ? 'PASS' : 'WARNING');
    expect(check?.evidence).toEqual(hasTitle ? ['Document title'] : []);
  });
});

describe('CJK meta description quality', () => {
  it.each([
    'lvsota 串接多廠牌設備與既有系統，建置監測、告警與報表，支援能源、儲能管理及現場作業。',
    '複数メーカーの設備と既存システムを接続し、監視、通知、レポートを提供します。',
    '여러 제조사의 장비와 기존 시스템을 연결하고 모니터링 및 알림과 보고서를 제공합니다.',
    '設備串接，監測告警，資料報表，能源管理，現場作業。',
    '設備串接、監測告警、資料報表、能源管理、現場作業。',
    'Read this practical guide to connecting equipment and monitoring energy usage.',
    'Read our 中文 guide to connecting equipment and monitoring energy usage.',
  ])('accepts a descriptive sentence: %s', description => {
    const doc = parseHtml('<p>Content</p>', 'fixture.html');
    doc.metaTags.description = description;
    expect(evaluate('meta-description-quality', doc)).toMatchObject({ score: 7, suggestions: [] });
  });

  it.each(['首頁', '歡迎光臨', '官方網站', 'ホーム', '홈페이지', 'Home', 'Welcome', 'Our products'])('keeps short or generic descriptions flagged: %s', description => {
    const doc = parseHtml('', 'fixture.html');
    doc.metaTags.description = description;
    expect(evaluate('meta-description-quality', doc).score).toBe(3);
  });

  it.each([',', '，', '、'])('detects keyword lists separated with %s', separator => {
    const doc = parseHtml('', 'fixture.html');
    doc.metaTags.description = ['設備串接', '監測告警', '資料報表', '能源管理', '現場作業'].join(separator);
    expect(evaluate('meta-description-quality', doc).suggestions[0].action).toBe('Replace the keyword list with a readable page summary');
  });
});

describe('CJK sentence boundaries and numeric versions', () => {
  const paragraph = [
    '設備使用 Modbus 讀取線圈暫存器，整合 MQTT gateway client broker publish subscribe topic payload sensor meter register coil。',
    '傳輸採用 MQTT 5.0，Modbus 與 MQTT 端則確認 endian offset address function timeout retry polling serial ethernet。',
    '監測畫面依照現場需求顯示告警，工程師先整理 voltage current power frequency temperature humidity pressure flow level status！',
    '軟體服務以 API 提供既有系統讀取資料，核對 authentication authorization pagination limits headers response request query filter cache？',
    '驗收時留下測試紀錄，逐項確認 mapping units precision timestamps history export retention backups validation documentation。',
  ].join('');

  it.each([paragraph, paragraph.replaceAll('設備', '设备').replaceAll('讀取', '读取')])('does not flag natural Modbus prose with MQTT 5.0', text => {
    const doc = parseHtml(`<main><p>${text}</p></main>`, 'fixture.html');
    expect(evaluate('keyword-stuffing-detection', doc)).toMatchObject({ score: 5, issues: [] });
  });

  it('does not turn repeated decimal/version fragments into adjacent sentences', () => {
    const doc = parseHtml('', 'fixture.html');
    // Only one sentence: numeric dots must not create repetition evidence.
    doc.rawText = Array.from({ length: 20 }, (_, i) => `MQTT Modbus ${i}.0 value${i} field${i}`).join(' ');
    expect(evaluate('keyword-stuffing-detection', doc)).toMatchObject({ score: 5, issues: [] });
  });

  it.each(['。', '！', '？', '. ', '! ', '? '])('still detects real adjacent repetition with %s', punctuation => {
    const doc = parseHtml('', 'fixture.html');
    doc.rawText = Array.from({ length: 20 }, () => 'MQTT Modbus MQTT Modbus repeated keyword content').join(punctuation);
    expect(evaluate('keyword-stuffing-detection', doc).score).toBeLessThan(5);
  });
});

describe('readiness scoring version compatibility', () => {
  it('keeps old baselines readable but withholds scores and page pairings across versions', () => {
    const page = scanDocument(parseHtml('<p>Test content</p>', 'fixture.html'), { details: true });
    const current: ScanReport = { pages: [page], overall: page.scores, summary: 'Test', timestamp: '2026-10-18T00:00:00Z', scoringVersion: SCORING_VERSION };
    const baseline = { ...current, scoringVersion: 'readiness-v0.6.0-details-v1' };
    expect(SCORING_VERSION).toBe('readiness-v0.6.1-details-v1');
    expect(() => parseScanReport(baseline)).not.toThrow();
    const comparison = compareReadiness(current, baseline);
    expect(comparison.comparable).toBe(false);
    expect(comparison.reasons).toContain('Comparable scans need the same scoring version. Re-scan with --details.');
    expect(comparison.changes.every(change => change.delta === null)).toBe(true);
    expect(comparison.pages).toEqual([]);
    expect(() => renderVisualReport(current, { baseline })).not.toThrow();
    expect(compareReadiness(current, current).comparable).toBe(true);
  });
});
