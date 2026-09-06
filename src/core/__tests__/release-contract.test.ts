import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleFixtureCorpus, ruleFixtureCorpusVersion, type RuleFixtureKind } from '../../../fixtures/v0.6/rule-corpus.js';
import { allRules } from '../rules.js';
import { parseHtml, scan } from '../scanner.js';
import type { ParsedDocument } from '../types.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, '../../..');
const fixtureKinds: RuleFixtureKind[] = ['positive', 'negative', 'boundary'];

function makeDocument(overrides: Partial<ParsedDocument>): ParsedDocument {
  return {
    url: 'fixture://v0.6-rule-corpus',
    title: 'v0.6 rule fixture',
    headings: [],
    paragraphs: [],
    jsonLd: [],
    metaTags: {},
    links: [],
    rawText: '',
    ...overrides,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function removeFirst(value: string, segment: string): string {
  const index = value.indexOf(segment);
  return index === -1 ? value : `${value.slice(0, index)} ${value.slice(index + segment.length)}`;
}

function renderFixtureHtml(document: Partial<ParsedDocument>): string {
  const head = Object.entries(document.metaTags ?? {})
    .map(([name, content]) => `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`)
    .join('');
  const headings = (document.headings ?? [])
    .map(({ level, text }) => `<h${level}>${escapeHtml(text)}</h${level}>`)
    .join('');
  const paragraphs = (document.paragraphs ?? [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const jsonLd = (document.jsonLd ?? [])
    .map((value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`)
    .join('');
  const links = (document.links ?? [])
    .map(({ href, text, rel }) => `<a href="${escapeHtml(href)}"${rel ? ` rel="${escapeHtml(rel)}"` : ''}>${escapeHtml(text)}</a>`)
    .join('');
  const suppliedHtml = document.html ?? '';

  let residualText = document.rawText ?? '';
  for (const knownText of [
    ...(document.headings ?? []).map(({ text }) => text),
    ...(document.paragraphs ?? []),
    ...(document.links ?? []).map(({ text }) => text),
    parseHtml(`<body>${suppliedHtml}</body>`, 'fixture://fragment').rawText,
  ]) {
    if (knownText) residualText = removeFirst(residualText, knownText);
  }

  return `<html><head>${head}${jsonLd}</head><body><main>${headings}${paragraphs}${links}${suppliedHtml}<div>${escapeHtml(residualText)}</div></main></body></html>`;
}

function expectIssueContract(issue: Record<string, unknown>): void {
  expect(['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity']).toContain(issue.dimension);
  expect(['critical', 'warning', 'info']).toContain(issue.severity);
  expect(typeof issue.message).toBe('string');
  expect((issue.message as string).length).toBeGreaterThan(0);
}

function expectSuggestionContract(suggestion: Record<string, unknown>): void {
  expect(['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity']).toContain(suggestion.dimension);
  expect(['high', 'medium', 'low']).toContain(suggestion.impact);
  expect(typeof suggestion.action).toBe('string');
  expect(typeof suggestion.detail).toBe('string');
  expect((suggestion.action as string).length).toBeGreaterThan(0);
  expect((suggestion.detail as string).length).toBeGreaterThan(0);
}

describe('v0.6 public rule fixture corpus', () => {
  const scoredRules = allRules.filter((rule) => rule.weight > 0);

  it('covers every scored rule and only scored rules', () => {
    expect(Object.keys(ruleFixtureCorpus).sort()).toEqual(scoredRules.map((rule) => rule.id).sort());
  });

  for (const rule of scoredRules) {
    describe(rule.id, () => {
      for (const kind of fixtureKinds) {
        it(`${kind} fixture matches the versioned expectation`, () => {
          const fixture = ruleFixtureCorpus[rule.id][kind];
          const result = rule.evaluate(makeDocument(fixture.document));

          expect(fixture.purpose.length).toBeGreaterThan(20);
          expect(result.maxScore).toBe(rule.weight);
          expect(result.score).toBe(fixture.expected.score);
          expect(result.issues).toHaveLength(fixture.expected.issues);
          expect(result.suggestions).toHaveLength(fixture.expected.suggestions);
          result.issues.forEach((issue) => expectIssueContract(issue as unknown as Record<string, unknown>));
          result.suggestions.forEach((suggestion) => expectSuggestionContract(suggestion as unknown as Record<string, unknown>));
        });

        it(`${kind} fixture survives the HTML parser boundary`, () => {
          const fixture = ruleFixtureCorpus[rule.id][kind];
          const parsedDocument = parseHtml(renderFixtureHtml(fixture.document), 'fixture://v0.6-rule-corpus.html');
          const result = rule.evaluate(parsedDocument);

          expect(result.maxScore).toBe(rule.weight);
          expect(result.score).toBe(fixture.expected.score);
          expect(result.issues).toHaveLength(fixture.expected.issues);
          expect(result.suggestions).toHaveLength(fixture.expected.suggestions);
        });
      }
    });
  }

  it('keeps the v0.6 scoring contract and Action sample aligned with the package release line', async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
    const methodology = await readFile(join(repositoryRoot, 'docs/methodology.md'), 'utf8');
    const sampleWorkflow = await readFile(
      join(repositoryRoot, 'examples/github-action-sample/.github/workflows/aeoptimize.yml'),
      'utf8',
    );

    expect(packageJson.version.split('.').slice(0, 2)).toEqual(ruleFixtureCorpusVersion.split('.').slice(0, 2));
    expect(methodology).toContain(`v${ruleFixtureCorpusVersion} scoring contract`);
    expect(sampleWorkflow).toContain(`uses: cucuwang/aeoptimize@v${packageJson.version}`);
    expect(sampleWorkflow).toContain('permissions:\n  contents: read');
    expect(sampleWorkflow).toContain('path: site');
    expect(sampleWorkflow).toContain("fail-on-low-score: 'false'");
    expect(sampleWorkflow).not.toContain('package-spec:');

    for (const rule of allRules) {
      expect(methodology).toContain(`\`${rule.id}\``);
    }
  });
});

describe('v0.6 JSON automation contract', () => {
  it('keeps the documented top-level and page-level fields stable', async () => {
    const report = await scan({
      type: 'file',
      path: join(repositoryRoot, 'examples/github-action-sample/site/index.html'),
    });

    expect(Object.keys(report).sort()).toEqual(['overall', 'pages', 'summary', 'timestamp']);
    expect(Object.keys(report.overall).sort()).toEqual([
      'aiMetadata',
      'citability',
      'contentDensity',
      'schema',
      'structure',
      'total',
    ]);
    expect(report.pages).toHaveLength(1);
    expect(Object.keys(report.pages[0]).sort()).toEqual(['issues', 'scores', 'suggestions', 'title', 'url']);
    expect(Object.keys(report.pages[0].scores).sort()).toEqual(Object.keys(report.overall).sort());
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
    expect(typeof report.summary).toBe('string');
    expect(typeof report.pages[0].title).toBe('string');
    expect(typeof report.pages[0].url).toBe('string');
    for (const score of [...Object.values(report.overall), ...Object.values(report.pages[0].scores)]) {
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    report.pages[0].issues.forEach((issue) => expectIssueContract(issue as unknown as Record<string, unknown>));
    report.pages[0].suggestions.forEach((suggestion) => expectSuggestionContract(suggestion as unknown as Record<string, unknown>));
  });

  it('ships release and rollback instructions with the package', async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
    const releaseGuide = await readFile(join(repositoryRoot, 'docs/release-v0.6.md'), 'utf8');
    const publicVerifier = await readFile(join(repositoryRoot, 'scripts/verify-release-v0.6.sh'), 'utf8');

    expect(packageJson.files).toContain('docs/release-v0.6.md');
    expect(packageJson.files).toContain('fixtures/');
    expect(packageJson.files).toContain('examples/github-action-sample/');
    expect(packageJson.files).toContain('scripts/verify-release-candidate.sh');
    expect(packageJson.files).toContain('scripts/verify-publish-source.sh');
    expect(packageJson.files).toContain('scripts/verify-release-v0.6.sh');
    expect(packageJson.scripts['release:check']).toBe('bash scripts/verify-release-candidate.sh');
    expect(packageJson.scripts.prepublishOnly).toBe(
      'npm run release:check && bash scripts/verify-publish-source.sh',
    );
    expect(releaseGuide).toContain('## Rollback');
    expect(releaseGuide).toContain('npm dist-tag add aeoptimize@0.6.2 latest');
    expect(releaseGuide).toContain('<verified-package-sha256>');
    expect(publicVerifier).toContain('.gitHead');
    expect(publicVerifier).toContain('EXPECTED_REPOSITORY_URL');
    expect(publicVerifier).toContain('.dist.tarball');
    expect(publicVerifier).toContain('EXPECTED_PACKAGE_SHA256');
  });
});
