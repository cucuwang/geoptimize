import { describe, it, expect } from 'vitest';
import { allRules, getRulesByDimension } from '../rules.js';
import type { ParsedDocument } from '../types.js';

function makeDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    url: 'test',
    title: 'Test Page',
    headings: [],
    paragraphs: [],
    jsonLd: [],
    metaTags: {},
    links: [],
    rawText: '',
    ...overrides,
  };
}

describe('allRules', () => {
  it('has rules for all five dimensions', () => {
    const dimensions = new Set(allRules.map((r) => r.dimension));
    expect(dimensions).toContain('structure');
    expect(dimensions).toContain('citability');
    expect(dimensions).toContain('schema');
    expect(dimensions).toContain('aiMetadata');
    expect(dimensions).toContain('contentDensity');
  });

  it('total max points sum to 100', () => {
    const total = allRules.reduce((sum, r) => sum + r.weight, 0);
    expect(total).toBe(100);
  });
});

describe('getRulesByDimension', () => {
  it('returns only rules for the specified dimension', () => {
    const structureRules = getRulesByDimension('structure');
    expect(structureRules.length).toBeGreaterThan(0);
    expect(structureRules.every((r) => r.dimension === 'structure')).toBe(true);
  });
});

describe('heading-hierarchy', () => {
  const rule = allRules.find((r) => r.id === 'heading-hierarchy')!;

  it('gives full score for proper hierarchy', () => {
    const doc = makeDoc({
      headings: [
        { level: 1, text: 'Title' },
        { level: 2, text: 'Section' },
        { level: 3, text: 'Subsection' },
      ],
      rawText: 'enough words '.repeat(50),
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBe(result.maxScore);
  });

  it('penalizes missing H1', () => {
    const doc = makeDoc({
      headings: [{ level: 2, text: 'Section' }],
      rawText: 'test',
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBeLessThan(result.maxScore);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('penalizes skipped heading levels', () => {
    const doc = makeDoc({
      headings: [
        { level: 1, text: 'Title' },
        { level: 3, text: 'Skipped H2' },
      ],
      rawText: 'test',
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBeLessThan(result.maxScore);
  });

  it('returns zero for no headings', () => {
    const result = rule.evaluate(makeDoc());
    expect(result.score).toBe(0);
  });
});

describe('paragraph-length', () => {
  const rule = allRules.find((r) => r.id === 'paragraph-length')!;

  it('gives full score for short paragraphs', () => {
    const doc = makeDoc({
      paragraphs: ['Short paragraph one.', 'Short paragraph two.', 'Short paragraph three.'],
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBe(result.maxScore);
  });

  it('penalizes long paragraphs', () => {
    const longText = 'word '.repeat(200);
    const doc = makeDoc({ paragraphs: [longText, longText, longText] });
    const result = rule.evaluate(doc);
    expect(result.score).toBeLessThan(result.maxScore);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('keyword-stuffing-detection', () => {
  const rule = allRules.find((r) => r.id === 'keyword-stuffing-detection')!;

  it('detects keyword stuffing via low diversity + consecutive repetition', () => {
    // Artificially stuffed: same words hammered into every sentence
    const stuffed = 'Buy cheap widgets now. Cheap widgets are the best widgets. ' +
      'Our widgets are cheap widgets for sale. Get cheap widgets today. ' +
      'Cheap widgets online cheap widgets store cheap widgets deals. ' +
      'Best cheap widgets cheap widgets review cheap widgets comparison. ' +
      'Order cheap widgets cheap widgets shipping cheap widgets discount.';
    const doc = makeDoc({ rawText: stuffed.repeat(3) });
    const result = rule.evaluate(doc);
    expect(result.score).toBeLessThan(result.maxScore);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('passes natural content even with topic-specific terms', () => {
    const natural = 'Artificial intelligence is transforming how search engines deliver results. ' +
      'Modern language models understand context and nuance in ways traditional algorithms cannot. ' +
      'Content creators should focus on clarity, structure, and providing genuine value to readers. ' +
      'The emergence of answer engines means websites need to be optimized for direct citation. ' +
      'Structured data helps machines parse and understand the relationships between concepts.';
    const doc = makeDoc({ rawText: natural.repeat(3) });
    const result = rule.evaluate(doc);
    expect(result.score).toBe(result.maxScore);
  });
});

describe('json-ld-presence', () => {
  const rule = allRules.find((r) => r.id === 'json-ld-presence')!;

  it('gives full score when JSON-LD exists', () => {
    const doc = makeDoc({ jsonLd: [{ '@type': 'Article', name: 'Test' }] });
    const result = rule.evaluate(doc);
    expect(result.score).toBe(result.maxScore);
  });

  it('treats missing JSON-LD as optional rather than critical', () => {
    const result = rule.evaluate(makeDoc());
    expect(result.score).toBe(result.maxScore);
    expect(result.issues[0].severity).toBe('info');
  });
});

describe('self-contained-statements', () => {
  const rule = allRules.find((r) => r.id === 'self-contained-statements')!;

  it('gives full score for self-contained paragraphs', () => {
    const doc = makeDoc({
      paragraphs: [
        'GEO stands for Generative Engine Optimization.',
        'The practice focuses on reproducible content readiness.',
        'Structured data should match visible page content.',
      ],
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBe(result.maxScore);
  });

  it('penalizes paragraphs starting with pronouns', () => {
    const doc = makeDoc({
      paragraphs: [
        'This is important.',
        'However, it depends.',
        'They also recommend.',
        'Furthermore, these changes.',
        'But results vary.',
      ],
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBeLessThan(result.maxScore);
  });
});

describe('meta-description-quality', () => {
  const rule = allRules.find((r) => r.id === 'meta-description-quality')!;

  it('gives full score for good meta description', () => {
    const doc = makeDoc({
      metaTags: { description: 'A page-specific introduction to content-readiness checks, evidence classes, and implementation limits.' },
    });
    const result = rule.evaluate(doc);
    expect(result.score).toBe(result.maxScore);
  });

  it('penalizes missing meta description', () => {
    const result = rule.evaluate(makeDoc());
    expect(result.score).toBe(0);
  });

  it('penalizes too-short meta description', () => {
    const doc = makeDoc({ metaTags: { description: 'Short.' } });
    const result = rule.evaluate(doc);
    expect(result.score).toBeLessThan(result.maxScore);
  });
});
