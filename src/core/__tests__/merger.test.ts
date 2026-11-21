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

  it('blends per-dimension scores at the multi-AI 50/50 weight', () => {
    const gemini = makeAiScore('gemini', 80);
    gemini.dimensions = { structure: 22, citability: 21, schema: 20, aiMetadata: 12, contentDensity: 13, total: 80 };
    const copilot = makeAiScore('copilot', 90);
    copilot.dimensions = { structure: 18, citability: 19, schema: 10, aiMetadata: 12, contentDensity: 13, total: 90 };
    const result = mergeScores(mockReport, [gemini, copilot]);
    // AI mean schema = 15, rule schema = 7 → 50/50 → 11 (a 60/40 blend would give 10)
    expect(result.overall.schema).toBe(11);
    // AI mean structure = 20, rule structure = 18 → 50/50 → 19
    expect(result.overall.structure).toBe(19);
  });

  it('caps merged dimensions at their maximum', () => {
    const ai = makeAiScore('gemini', 80);
    ai.dimensions = { structure: 40, citability: 45, schema: 45, aiMetadata: 30, contentDensity: 30, total: 80 };
    const result = mergeScores(mockReport, [ai]);
    // Without the per-dimension cap these would merge to 27/28/22/17/19.
    expect(result.overall.structure).toBe(25);
    expect(result.overall.citability).toBe(25);
    expect(result.overall.schema).toBe(20);
    expect(result.overall.aiMetadata).toBe(15);
    expect(result.overall.contentDensity).toBe(15);
  });

  it('never lets merged dimensions go below zero', () => {
    const ai = makeAiScore('gemini', 1);
    ai.dimensions = { structure: -50, citability: 20, schema: 15, aiMetadata: 12, contentDensity: 13, total: 1 };
    const result = mergeScores(mockReport, [ai]);
    expect(result.overall.structure).toBe(0);
  });

  it('ignores available AIs that returned a zero score', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 0, true)]);
    expect(result.consensusScore).toBe(61);
    expect(result.methodology).toContain('Rule engine only');
  });

  it('keeps only available AIs in the blend', () => {
    const result = mergeScores(mockReport, [makeAiScore('gemini', 80), makeAiScore('copilot', 90, false)]);
    // Only gemini counts: 61 * 0.6 + 80 * 0.4 = 69
    expect(result.consensusScore).toBe(69);
    expect(result.methodology).toContain('60%');
    expect(result.methodology).toContain('gemini');
    expect(result.methodology).not.toContain('copilot');
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

  it('averages differing dimension values and derives the total', () => {
    const gemini = makeAiScore('gemini', 80);
    gemini.dimensions = { structure: 22, citability: 21, schema: 20, aiMetadata: 12, contentDensity: 13, total: 80 };
    const copilot = makeAiScore('copilot', 90);
    copilot.dimensions = { structure: 18, citability: 19, schema: 10, aiMetadata: 12, contentDensity: 13, total: 90 };
    const avg = averageAiDimensions([gemini, copilot]);
    expect(avg!.structure).toBe(20);
    expect(avg!.citability).toBe(20);
    expect(avg!.schema).toBe(15);
    expect(avg!.total).toBe(80);
  });

  it('returns null when no available AIs', () => {
    expect(averageAiDimensions([])).toBeNull();
    expect(averageAiDimensions([makeAiScore('gemini', 0, false)])).toBeNull();
  });
});
