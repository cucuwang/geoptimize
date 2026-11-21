import { describe, it, expect } from 'vitest';
import { mergeScores, averageAiDimensions } from '../merger.js';
import type { ScanReport, AiScorerResult, DimensionScores } from '../types.js';

const mockDimensions: DimensionScores = { structure: 18, citability: 16, schema: 7, aiMetadata: 8, contentDensity: 12, total: 61 };

const mockReport: ScanReport = {
  pages: [{
    url: 'https://example.com',
    title: 'Test',
    scores: mockDimensions,
    issues: [],
    suggestions: [],
  }],
  overall: mockDimensions,
  summary: 'Good (61/100)',
  timestamp: '2026-04-07T00:00:00Z',
};

function makeAiScore(source: 'gemini' | 'copilot', score: number, available = true): AiScorerResult {
  return {
    source,
    score,
    dimensions: { structure: 20, citability: 20, schema: 15, aiMetadata: 12, contentDensity: 13, total: score },
    insight: `${source} insight`,
    available,
  };
}

describe('mergeScores', () => {
  it('uses rule engine only when no AI scores', () => {
    const result = mergeScores(mockReport, []);
    expect(result.consensusScore).toBe(61);
    expect(result.ruleScore).toBe(61);
    expect(result.methodology).toContain('Rule engine only');
  });

  it('uses 60/40 weighting with one AI', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80)]);
    // 61 * 0.6 + 80 * 0.4 = 36.6 + 32 = 68.6 → 69
    expect(result.consensusScore).toBe(69);
    expect(result.methodology).toContain('60%');
    expect(result.methodology).toContain('gemini');
  });

  it('uses 50/50 weighting with multiple AIs', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80), makeAiScore('copilot', 90)]);
    // AI avg = 85, rule = 61
    // 61 * 0.5 + 85 * 0.5 = 30.5 + 42.5 = 73
    expect(result.consensusScore).toBe(73);
    expect(result.methodology).toContain('50%');
  });

  it('ignores unavailable AI scores', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80, false)]);
    expect(result.consensusScore).toBe(61);
    expect(result.methodology).toContain('Rule engine only');
  });

  it('preserves aiScores array in output', () => {
    const scores = [makeAiScore('gemini', 80)];
    const result = mergeScores(mockReport, scores);
    expect(result.aiScores).toEqual(scores);
  });

  it('blends per-dimension scores at the single-AI 60/40 weight', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80)]);
    // rule 18*0.6 + ai 20*0.4 = 18.8 → 19; citability 16*.6+20*.4=17.6 → 18
    expect(result.overall.structure).toBe(19);
    expect(result.overall.citability).toBe(18);
    expect(result.overall.schema).toBe(10);
    expect(result.overall.aiMetadata).toBe(10);
    expect(result.overall.contentDensity).toBe(12);
    expect(result.overall.total).toBe(result.consensusScore);
  });

  it('blends per-dimension scores at the multi-AI 50/50 weight', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80), makeAiScore('copilot', 90)]);
    // rule 18*0.5 + ai 20*0.5 = 19
    expect(result.overall.structure).toBe(19);
    expect(result.methodology).toContain('gemini, copilot');
  });

  it('caps merged dimensions at their maximum', () => {
    const report: ScanReport = {
      ...mockReport,
      overall: { structure: 25, citability: 25, schema: 20, aiMetadata: 15, contentDensity: 15, total: 100 },
    };
    const result = mergeScores(report, [{ ...makeAiScore('gemini', 100), dimensions: { structure: 25, citability: 25, schema: 20, aiMetadata: 15, contentDensity: 15, total: 100 } }]);
    expect(result.overall.structure).toBe(25);
    expect(result.overall.schema).toBe(20);
    expect(result.overall.aiMetadata).toBe(15);
  });

  it('excludes zero-score AI results from the blend', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 0)]);
    expect(result.consensusScore).toBe(61);
    expect(result.methodology).toContain('Rule engine only');
    expect(result.overall.structure).toBe(18);
  });

  it('keeps report fields and scores consistent', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80)]);
    expect(result.pages).toEqual(mockReport.pages);
    expect(result.timestamp).toBe(mockReport.timestamp);
    expect(result.summary).toBe(mockReport.summary);
    expect(result.consensusScore).toBe(result.overall.total);
  });
});

describe('averageAiDimensions', () => {
  it('averages dimensions across available AIs', () => {
    const scores = [
      makeAiScore('gemini', 80),
      makeAiScore('copilot', 90),
    ];
    const avg = averageAiDimensions(scores);
    expect(avg).not.toBeNull();
    expect(avg!.structure).toBe(20);
  });

  it('returns null when no available AIs', () => {
    expect(averageAiDimensions([])).toBeNull();
    expect(averageAiDimensions([makeAiScore('gemini', 0, false)])).toBeNull();
  });

  it('excludes unavailable and zero-score entries from the average', () => {
    const avg = averageAiDimensions([
      { ...makeAiScore('gemini', 80), dimensions: { structure: 10, citability: 10, schema: 10, aiMetadata: 10, contentDensity: 10, total: 50 } },
      makeAiScore('copilot', 90, false),
      makeAiScore('gemini', 0),
    ]);
    expect(avg).not.toBeNull();
    expect(avg!.structure).toBe(10);
    expect(avg!.total).toBe(50);
  });

  it('recomputes total as the sum of averaged dimensions', () => {
    const avg = averageAiDimensions([makeAiScore('gemini', 90), makeAiScore('copilot', 20)]);
    expect(avg!.total).toBe(avg!.structure + avg!.citability + avg!.schema + avg!.aiMetadata + avg!.contentDensity);
  });
});
