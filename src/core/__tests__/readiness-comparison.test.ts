import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseHtml, scanDocument, scan, SCORING_VERSION } from '../scanner.js';
import { compareReadiness, validateReadinessDetails } from '../readiness-comparison.js';
import { allRules } from '../rules.js';
import type { ScanReport } from '../types.js';

async function detailed(name = 'bad-page.html'): Promise<ScanReport> {
  const source = await readFile(`src/core/__tests__/fixtures/${name}`, 'utf8');
  const page = scanDocument(parseHtml(source, 'https://example.com/'), { details: true });
  return { pages: [page], overall: page.scores, summary: 'Test', timestamp: '2026-09-09T00:00:00Z', scoringVersion: SCORING_VERSION };
}

describe('detailed readiness evidence', () => {
  it('retains exact rule evaluator results without changing legacy scores or keys', async () => {
    const source = await readFile('src/core/__tests__/fixtures/bad-page.html', 'utf8');
    const doc = parseHtml(source, 'https://example.com/');
    const plain = scanDocument(doc);
    const evidence = scanDocument(doc, { details: true });
    expect(evidence.scores).toEqual(plain.scores);
    expect(plain).not.toHaveProperty('ruleResults');
    expect(plain).not.toHaveProperty('sourcePreview');
    expect(evidence.ruleResults).toHaveLength(17);
    for (const rule of allRules) {
      expect(evidence.ruleResults!.find(r => r.id === rule.id)).toEqual({ id: rule.id, dimension: rule.dimension, weight: rule.weight, ...rule.evaluate(doc) });
    }
    expect(evidence.sourcePreview!.text).toBe(source.slice(0, 6000));
  });

  it('propagates opt-in evidence through file and directory scans', async () => {
    for (const target of [
      { type: 'file' as const, path: 'src/core/__tests__/fixtures/good-page.html' },
      { type: 'directory' as const, path: 'src/core/__tests__/fixtures' },
    ]) {
      const report = await scan(target, { details: true });
      expect(report.scoringVersion).toBe(SCORING_VERSION);
      expect(report.pages.every(p => p.ruleResults?.length === 17)).toBe(true);
      expect(report.pages.every(p => ['local-file', 'markdown'].includes(p.sourcePreview!.capture))).toBe(true);
      expect(() => validateReadinessDetails(report)).not.toThrow();
    }
  });

  it('bounds and labels captured excerpts', () => {
    const source = '<p>' + 'word '.repeat(2000) + '</p>';
    const page = scanDocument(parseHtml(source, 'https://example.com/'), { details: true });
    expect(page.sourcePreview).toEqual({ text: source.slice(0, 6000), truncated: true, format: 'html', capture: 'provided-html' });
  });

  it('rejects contradictory source provenance', async () => {
    const report = await detailed();
    report.pages[0].sourcePreview!.capture = 'markdown';
    expect(() => validateReadinessDetails(report)).toThrow(/preview/);
  });

  it('rejects tampered, incomplete or unknown-version evidence', async () => {
    const report = await detailed();
    report.pages[0].ruleResults![0].score = 0;
    expect(() => validateReadinessDetails(report)).toThrow(/reproduce/);
    const incomplete = await detailed();
    incomplete.pages[0].ruleResults!.pop();
    expect(() => validateReadinessDetails(incomplete)).toThrow(/complete/);
    expect(() => validateReadinessDetails({ ...incomplete, scoringVersion: 'unknown' })).toThrow(/version/);
  });
});

describe('readiness comparison', () => {
  it('compares matched page sets and preserves original source evidence', async () => {
    const before = await detailed();
    const after = await detailed('good-page.html');
    const comparison = compareReadiness(after, before);
    expect(comparison.comparable).toBe(true);
    expect(comparison.changes).toHaveLength(6);
    expect(comparison.changes.find(c => c.key === 'total')!.delta).toBe(after.overall.total - before.overall.total);
    expect(comparison.pages[0].before.sourcePreview!.text).toContain('Best SEO Tips');
    expect(comparison.pages[0].after.sourcePreview!.text).toContain('Generative Engine Optimization');
  });

  it('rejects invalid dates and score totals at the public comparison boundary', async () => {
    const baseline = await detailed();
    const invalidDate = await detailed();
    invalidDate.timestamp = 'invalid';
    expect(() => compareReadiness(invalidDate, baseline)).toThrow(/timestamp/);
    const invalidTotal = await detailed();
    invalidTotal.overall = { ...invalidTotal.overall, total: 100 };
    expect(() => compareReadiness(invalidTotal, baseline)).toThrow(/scores/);
  });

  it('withholds deltas and source pairings for old, mismatched or reversed scans', async () => {
    const before = await detailed();
    const after = await detailed();
    after.pages[0].url = 'https://example.com/different';
    expect(compareReadiness(after, before).comparable).toBe(false);
    after.pages[0].url = before.pages[0].url;
    after.timestamp = '2000-01-01T00:00:00Z';
    expect(compareReadiness(after, before).pages).toEqual([]);
    delete after.scoringVersion;
    delete after.pages[0].ruleResults;
    expect(compareReadiness(after, before).changes.every(c => c.delta === null)).toBe(true);
  });
});
