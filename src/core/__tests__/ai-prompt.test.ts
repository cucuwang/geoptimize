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

  it('parses JSON when "score" is mentioned in prose before the object', () => {
    const raw = 'The "score" field is computed as follows: {"score": 60, "insight": "ok"}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(60);
    expect(result!.insight).toBe('ok');
  });

  it('parses JSON when a prose brace group precedes the object', () => {
    const raw = 'note {"score" is text}: {"score": 55, "insight": "real"}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(55);
    expect(result!.insight).toBe('real');
  });

  it('parses objects whose string values contain braces', () => {
    const raw = '{"score": 62, "insight": "closing } and opening { braces"}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(62);
    expect(result!.insight).toBe('closing } and opening { braces');
  });

  it('parses objects whose string values contain escaped quotes and braces', () => {
    const raw = '{"score": 61, "insight": "use \\"json\\" } carefully"}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(61);
    expect(result!.insight).toBe('use "json" } carefully');
  });

  it('ignores brace groups inside strings that precede "score"', () => {
    const raw = '{"insight": "a { brace", "score": 70}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(70);
    expect(result!.insight).toBe('a { brace');
  });

  it('uses the first balanced object with a numeric score', () => {
    const raw = '{"insight": "no score here"} {"score": 33, "insight": "chosen"} {"score": 44}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(33);
  });

  it('accepts boundary scores 0 and 100', () => {
    expect(parseAiResponse('{"score": 0}')!.score).toBe(0);
    expect(parseAiResponse('{"score": 100}')!.score).toBe(100);
  });

  it('falls back to 0 for non-numeric dimension values instead of NaN', () => {
    const raw = '{"score": 60, "structure": "high", "citability": [], "schema": {}, "insight": "x"}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    for (const key of ['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity'] as const) {
      expect(Number.isFinite(result![key])).toBe(true);
      expect(result![key]).toBe(0);
    }
  });

  it('replaces a non-string insight with the default message', () => {
    const result = parseAiResponse('{"score": 60, "insight": 42}');
    expect(result).not.toBeNull();
    expect(result!.insight).toBe('No insight provided');
  });

  it('still rejects objects without a numeric score', () => {
    expect(parseAiResponse('{"score": null}')).toBeNull();
    expect(parseAiResponse('{"score": "60"}')).toBeNull();
    expect(parseAiResponse('{"total": 60}')).toBeNull();
  });
});
