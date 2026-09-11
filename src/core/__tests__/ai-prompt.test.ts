import { describe, it, expect } from 'vitest';
import { buildScoringPrompt, parseAiResponse } from '../ai-prompt.js';

describe('buildScoringPrompt', () => {
  it('includes URL and truncated content', () => {
    const prompt = buildScoringPrompt('<html><body>Hello</body></html>', 'https://example.com');
    expect(prompt).toContain('https://example.com');
    expect(prompt).toContain('Hello');
    expect(prompt).toContain('structure');
    expect(prompt).toContain('citability');
  });

  it('truncates long content', () => {
    const longHtml = 'x'.repeat(20000);
    const prompt = buildScoringPrompt(longHtml, 'test');
    expect(prompt.length).toBeLessThan(longHtml.length);
  });

  it('preserves unmatched markup tails while stripping matched tags', () => {
    const manyOpeners = '<'.repeat(6000);
    const content = `before <strong>bold</strong> after ${manyOpeners} tail`;
    const prompt = buildScoringPrompt(content, 'test');
    const excerpt = prompt.split('---BEGIN UNTRUSTED PAGE CONTENT---\n')[1].split('\n---END UNTRUSTED PAGE CONTENT---')[0];

    expect(excerpt).toBe(`before bold after ${manyOpeners} tail`);
  });
});

describe('parseAiResponse', () => {
  it('parses valid JSON response', () => {
    const raw = '{"score": 75, "structure": 20, "citability": 18, "schema": 15, "aiMetadata": 12, "contentDensity": 10, "insight": "Good structure"}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(75);
    expect(result!.structure).toBe(20);
    expect(result!.insight).toBe('Good structure');
  });

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is the analysis:\n{"score": 60, "structure": 15, "citability": 15, "schema": 10, "aiMetadata": 10, "contentDensity": 10, "insight": "Needs work"}\nDone.';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(60);
  });

  it('clamps out-of-range values', () => {
    const raw = '{"score": 150, "structure": 30, "citability": -5, "schema": 20, "aiMetadata": 15, "contentDensity": 15, "insight": "test"}';
    const result = parseAiResponse(raw);
    expect(result!.score).toBe(100);
    expect(result!.structure).toBe(25);
    expect(result!.citability).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(parseAiResponse('not json')).toBeNull();
    expect(parseAiResponse('{}')).toBeNull();
    expect(parseAiResponse('{"score": "abc"}')).toBeNull();
  });

  it('handles missing optional fields', () => {
    const raw = '{"score": 50}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.structure).toBe(0);
    expect(result!.insight).toBe('No insight provided');
  });
});
