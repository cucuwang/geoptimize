import { describe, expect, it } from 'vitest';
import { parseScanReport, renderVisualReport } from '../visual-report.js';
import { parseHtml, scanDocument, scan, SCORING_VERSION } from '../scanner.js';
import type { ScanReport } from '../types.js';

function fixture(html = '<h1>Example</h1><p>A definition is an explanation of a term.</p>'): ScanReport {
  const page = scanDocument(parseHtml(html, 'https://example.com/'));
  return { pages: [page], overall: page.scores, timestamp: '2026-09-09T00:00:00Z', summary: 'Fixture' };
}

describe('visual report', () => {
  it('preserves every readiness dimension and the exact original total', () => {
    const report = fixture();
    const html = renderVisualReport(report);
    expect(html).toContain(`${report.overall.total}<small> / 100`);
    for (const label of ['Structure', 'Citability', 'Schema', 'AI Metadata', 'Content Density']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html.match(/<meter /g)).toHaveLength(5);
    expect(html).toContain('Page score distribution');
    expect(html).toContain('Findings by severity');
    expect(html).toContain('Not measured');
  });

  it('escapes source titles, issues, URLs and remediation without executing source markup', () => {
    const report = fixture();
    const attack = '</script><img src=x onerror=alert(1)>';
    report.pages[0].title = attack;
    report.pages[0].url = attack;
    report.pages[0].issues.push({ message: attack, selector: attack, severity: 'warning', dimension: 'structure' });
    report.pages[0].suggestions.push({ action: attack, detail: attack, dimension: 'structure', impact: 'high' });
    const html = renderVisualReport(report);
    expect(html).not.toContain(attack);
    expect(html).toContain('&lt;/script&gt;&lt;img');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it('shows empty scans as unavailable rather than a measured zero', () => {
    const report = fixture();
    report.pages = [];
    report.overall = { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 };
    expect(renderVisualReport(report)).toContain('N/A<small> / 100');
  });

  it('rejects invalid scores and malformed reports', () => {
    expect(() => parseScanReport({})).toThrow(/scan --json/);
    const report = fixture();
    report.overall.structure = 26;
    expect(() => renderVisualReport(report)).toThrow(/valid page scores/);
  });

  it('rejects inconsistent totals, fractional scores and invalid page averages', () => {
    const total = fixture();
    total.overall = { ...total.overall, total: 100 };
    expect(() => parseScanReport(total)).toThrow();
    const fractional = fixture();
    fractional.pages[0].scores.structure = 2.5;
    expect(() => parseScanReport(fractional)).toThrow();
    const average = fixture();
    average.overall = { ...average.overall, structure: average.overall.structure - 1, total: average.overall.total - 1 };
    expect(() => parseScanReport(average)).toThrow(/averages/);
  });

  it('renders real scored fixtures with expandable evidence and suggestions', async () => {
    const report = await scan({ type: 'file', path: 'src/core/__tests__/fixtures/bad-page.html' });
    const html = renderVisualReport(report, { demo: true });
    expect(html).toContain('Synthetic demonstration');
    expect(html).toContain('data-severity="warning"');
    expect(html).toContain('Suggested improvements');
    expect(html).toContain('id="page-search"');
    expect(html).toContain('id="severity"');
    expect(html).toContain('Scoring severity');
    expect(html).toContain('All scoring observations');
  });
});


describe('interactive readiness details', () => {
  const detailed = (html: string): ScanReport => {
    const page = scanDocument(parseHtml(html, 'https://example.com/'), { details: true });
    return { pages: [page], overall: page.scores, timestamp: '2026-09-09T00:00:00Z', scoringVersion: SCORING_VERSION, summary: 'Fixture' };
  };

  it('renders baseline scores, all rule rows and escaped source examples', () => {
    const before = detailed('<h3>Before</h3><p>Before copy.</p>');
    const after = detailed('<h1>After</h1><p>After copy.</p><img src=x onerror=alert(1)>');
    const html = renderVisualReport(after, { baseline: before });
    expect(html).toContain(`Baseline ${before.overall.total} / 100`);
    expect(html).toContain('heading-hierarchy');
    expect(html).toContain('llms-txt-presence');
    expect(html).toContain('id="source-comparisons"');
    expect(html).toContain('provided-html');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  it('withholds unversioned baseline deltas and marks missing raw rule evidence', () => {
    const old = fixture();
    const html = renderVisualReport(old, { baseline: old });
    expect(html).toContain('Baseline comparison unavailable');
    expect(html).toContain('Rule details were not recorded');
    expect(html).not.toContain('class="source-pair"');
  });
});
