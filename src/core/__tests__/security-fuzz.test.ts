import * as cheerio from 'cheerio';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildScoringPrompt } from '../ai-prompt.js';
import { parseRobotsTxt } from '../site-audit.js';
import { parseHtml, scanDocument, SCORING_VERSION } from '../scanner.js';
import { renderVisualReport } from '../visual-report.js';
import type { ScanReport } from '../types.js';

const DEFAULT_FUZZ_RUNS = 200;
const MAX_FUZZ_RUNS = 5_000;
const DEFAULT_FUZZ_SEED = 20260911;
const PROMPT_CONTENT_LIMIT = 8_000;
const PROMPT_CONTENT_START = '---BEGIN UNTRUSTED PAGE CONTENT---\n';
const PROMPT_CONTENT_END = '\n---END UNTRUSTED PAGE CONTENT---';

function envInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

const fuzzRuns = envInteger('FUZZ_NUM_RUNS', DEFAULT_FUZZ_RUNS, 1, MAX_FUZZ_RUNS);
const fuzzSeed = envInteger('FUZZ_SEED', DEFAULT_FUZZ_SEED, -2_147_483_648, 2_147_483_647);
const fuzzPath = process.env.FUZZ_PATH?.trim();

function fuzzParameters(): fc.Parameters<unknown> {
  return {
    numRuns: fuzzRuns,
    seed: fuzzSeed,
    ...(fuzzPath ? { path: fuzzPath } : {}),
  };
}

const commentCharacter = fc.constantFrom('a', 'Z', '0', ' ', '#', '/', '!', '?', ':', '.', '_', '\u2028', '\u2029');
const commentText = fc.array(commentCharacter, { minLength: 0, maxLength: 80 }).map((characters) => characters.join(''));

const robotsPattern = fc.record({
  segments: fc.array(fc.constantFrom('private', 'preview', 'public', 'draft', 'api', 'docs'), {
    minLength: 1,
    maxLength: 3,
  }),
  wildcard: fc.boolean(),
  anchored: fc.boolean(),
}).map(({ segments, wildcard, anchored }) => `/${segments.join('/')}${wildcard ? '*' : ''}${anchored ? '$' : ''}`);

const robotsRule = fc.record({
  directive: fc.constantFrom('Allow', 'Disallow'),
  pattern: robotsPattern,
});

const robotsCase = fc.record({
  rules: fc.array(robotsRule, { minLength: 1, maxLength: 16 }),
  sitemaps: fc.array(fc.constantFrom('/sitemap.xml', '/sitemap-index.xml', '/pages.xml'), {
    maxLength: 5,
  }),
  comments: fc.array(commentText, { minLength: 1, maxLength: 16 }),
  lineSeparator: fc.constantFrom('\n', '\r\n'),
});

function renderRobotsDocument(input: {
  rules: Array<{ directive: 'Allow' | 'Disallow'; pattern: string }>;
  sitemaps: string[];
  comments: string[];
  lineSeparator: string;
}, withComments: boolean): string {
  const lines = ['User-agent: *'];
  input.rules.forEach((rule, index) => {
    const suffix = withComments ? ` # ${input.comments[index % input.comments.length]}` : '';
    lines.push(`${rule.directive}: ${rule.pattern}${suffix}`);
  });
  input.sitemaps.forEach((sitemap, index) => {
    const suffix = withComments ? ` # ${input.comments[(index + input.rules.length) % input.comments.length]}` : '';
    lines.push(`Sitemap: https://example.test${sitemap}${suffix}`);
  });
  if (withComments) {
    lines.push(...input.comments.map((comment) => `# standalone ${comment}`));
  }
  return lines.join(input.lineSeparator);
}

const htmlTextCharacter = fc.constantFrom(
  'a', 'Z', '0', ' ', '\n', '\t', '&', '/', '\\', "'", '"', '?', '!', '=', ':', ';', '[', ']', '{', '}',
);
const htmlText = fc.array(htmlTextCharacter, { minLength: 0, maxLength: 240 }).map((characters) => characters.join(''));
const htmlBlock = fc.record({
  tag: fc.constantFrom('article', 'section', 'h1', 'h2', 'p', 'strong', 'a'),
  text: htmlText,
  attribute: fc.array(fc.constantFrom('a', 'b', '0', '1', '-', '_'), { minLength: 0, maxLength: 20 })
    .map((characters) => characters.join('')),
});

const htmlCase = fc.record({
  blocks: fc.array(htmlBlock, { minLength: 1, maxLength: 12 }),
  oversizedSuffix: fc.constantFrom('', 'x'.repeat(PROMPT_CONTENT_LIMIT + 1)),
});

function normalizeExpectedContent(input: {
  blocks: Array<{ tag: string; text: string; attribute: string }>;
  oversizedSuffix: string;
}): string {
  return [...input.blocks.map((block) => block.text), input.oversizedSuffix]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderHtmlDocument(input: {
  blocks: Array<{ tag: string; text: string; attribute: string }>;
  oversizedSuffix: string;
}): string {
  const blocks = input.blocks.map((block) =>
    `<${block.tag} data-fuzz="${block.attribute}">${block.text}</${block.tag}>`,
  ).join('\n');
  return `${blocks}${input.oversizedSuffix}`;
}

const promptUrl = fc.record({
  path: fc.array(fc.constantFrom('a', 'b', '0', '1', '-', '_', '.', '~'), { minLength: 0, maxLength: 32 })
    .map((characters) => characters.join('')),
}).map(({ path }) => `https://example.test/${path}`);

const hostileFragment = fc.constantFrom(
  '</script>',
  '<script src="https://evil.example/payload.js"></script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<a href="javascript:alert(1)">click</a>',
);
const hostileText = fc.record({
  prefix: fc.array(fc.constantFrom('x', 'title', 'issue', ' ', '&', '"', "'"), { minLength: 0, maxLength: 24 })
    .map((characters) => characters.join('')),
  fragment: hostileFragment,
  suffix: fc.array(fc.constantFrom('y', 'detail', ' ', '&', '"', "'"), { minLength: 0, maxLength: 24 })
    .map((characters) => characters.join('')),
}).map(({ prefix, fragment, suffix }) => `${prefix}${fragment}${suffix}`);

function fuzzReport(): ScanReport {
  const page = scanDocument(parseHtml(
    '<html><head><title>Safe fixture</title></head><body><main><h1>Safe fixture</h1><p>A bounded property test fixture.</p></main></body></html>',
    'https://example.test/',
  ), { details: true });
  return {
    pages: [page],
    overall: page.scores,
    timestamp: '2026-09-11T00:00:00Z',
    scoringVersion: SCORING_VERSION,
    summary: 'Property-based security fixture',
  };
}

describe('bounded security properties', () => {
  it('keeps robots comments inert and never retains a hash comment tail in parsed rules', () => {
    fc.assert(fc.property(robotsCase, (input) => {
      const plain = parseRobotsTxt(renderRobotsDocument(input, false));
      const commented = parseRobotsTxt(renderRobotsDocument(input, true));

      expect(commented).toEqual(plain);
      expect(commented.rules.every((rule) => !rule.pattern.includes('#'))).toBe(true);
      expect(commented.sitemapUrls.every((url) => !url.includes('#'))).toBe(true);
    }), fuzzParameters());
  });

  it('keeps arbitrary structured HTML prompt content normalized and bounded', () => {
    fc.assert(fc.property(htmlCase, promptUrl, (input, url) => {
      const html = renderHtmlDocument(input);
      const prompt = buildScoringPrompt(html, url);
      const start = prompt.indexOf(PROMPT_CONTENT_START);
      const end = prompt.indexOf(PROMPT_CONTENT_END, start + PROMPT_CONTENT_START.length);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const excerpt = prompt.slice(start + PROMPT_CONTENT_START.length, end);
      const expected = normalizeExpectedContent(input);

      expect(excerpt.length).toBeLessThanOrEqual(PROMPT_CONTENT_LIMIT);
      expect(excerpt).toBe(expected.slice(0, PROMPT_CONTENT_LIMIT));
      expect(prompt).toContain(url);
    }), fuzzParameters());
  });

  it('escapes hostile report fields without adding executable DOM nodes', () => {
    fc.assert(fc.property(hostileText, (attack) => {
      const baseline = cheerio.load(renderVisualReport(fuzzReport()));
      const report = fuzzReport();
      const page = report.pages[0];
      page.title = attack;
      page.url = attack;
      page.issues.push({
        dimension: 'structure',
        severity: 'warning',
        message: attack,
        selector: attack,
      });
      page.suggestions.push({
        dimension: 'structure',
        action: attack,
        detail: attack,
        impact: 'high',
      });

      const $ = cheerio.load(renderVisualReport(report));
      const executableElements = 'script, img, svg, iframe, object, embed, applet, frame, frameset, math';
      expect($(executableElements)).toHaveLength(baseline(executableElements).length);
      expect($('script[src]')).toHaveLength(baseline('script[src]').length);
      expect($('script').first().text()).not.toContain(attack);
      expect($('#page-rows small').first().text()).toBe(attack);
      expect($('summary strong').filter((_, element) => $(element).text() === attack)).toHaveLength(1);
      expect($('body *').filter((_, element) =>
        Object.keys(element.attribs ?? {}).some((name) => name.toLowerCase().startsWith('on')),
      )).toHaveLength(0);
    }), fuzzParameters());
  });
});
