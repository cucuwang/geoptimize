import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { allRules } from '../rules.js';
import type { ParsedDocument } from '../types.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function makeDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    url: 'fixture',
    title: 'Fixture',
    headings: [],
    paragraphs: [],
    jsonLd: [],
    metaTags: {},
    links: [],
    rawText: '',
    ...overrides,
  };
}

describe('evidence boundaries', () => {
  it('does not score FAQ or llms.txt presence', () => {
    const faq = allRules.find((rule) => rule.id === 'faq-presence')!;
    const llms = allRules.find((rule) => rule.id === 'llms-txt-presence')!;

    expect(faq.weight).toBe(0);
    expect(faq.evaluate(makeDoc())).toMatchObject({ maxScore: 0, suggestions: [] });
    expect(llms.weight).toBe(0);
    expect(llms.evaluate(makeDoc())).toMatchObject({ maxScore: 0, suggestions: [] });
  });

  it('does not penalize multiple H1 elements as an automatic error', () => {
    const rule = allRules.find((candidate) => candidate.id === 'heading-hierarchy')!;
    const result = rule.evaluate(makeDoc({
      headings: [
        { level: 1, text: 'Primary' },
        { level: 1, text: 'Secondary region' },
        { level: 2, text: 'Details' },
      ],
      rawText: 'Readable content.',
    }));

    expect(result.score).toBe(result.maxScore);
    expect(result.issues.join(' ')).not.toContain('exactly one H1');
  });

  it('does not impose a fixed meta-description length', () => {
    const rule = allRules.find((candidate) => candidate.id === 'meta-description-quality')!;
    const result = rule.evaluate(makeDoc({
      metaTags: { description: `A page-specific summary ${'with useful context '.repeat(20)}` },
    }));

    expect(result.score).toBe(result.maxScore);
    expect(result.suggestions).toHaveLength(0);
  });
});

describe('public metadata', () => {
  it('uses the current repository owner and exposes root Action metadata', async () => {
    const paths = [
      'README.md',
      'package.json',
      '.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
      'src/cli/index.ts',
      'action.yml',
    ];
    const contents = await Promise.all(paths.map((path) => readFile(join(root, path), 'utf8')));
    const publicSurface = contents.join('\n');

    expect(publicSurface).not.toContain('dexuwang627-cloud');
    expect(publicSurface).toContain('cucuwang/aeoptimize');
  });

  it('keeps v0.6 package, CLI, plugin, and Action versions aligned', async () => {
    const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const pluginJson = JSON.parse(await readFile(join(root, '.claude-plugin/plugin.json'), 'utf8'));
    const marketplaceJson = JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
    const cli = await readFile(join(root, 'src/cli/index.ts'), 'utf8');
    const action = await readFile(join(root, 'action.yml'), 'utf8');
    const compatibilityAction = await readFile(join(root, 'action/action.yml'), 'utf8');

    expect(packageJson.version).toBe('0.7.0');
    expect(pluginJson.version).toBe(packageJson.version);
    expect(marketplaceJson.metadata.version).toBe(packageJson.version);
    expect(cli).toContain(`.version('${packageJson.version}')`);
    expect(action).toContain(`default: 'aeoptimize@${packageJson.version}'`);
    expect(action).toContain("fail-on-low-score:\n    description:");
    expect(action).toContain("default: 'false'");
    expect(compatibilityAction).toContain(`default: 'aeoptimize@${packageJson.version}'`);
    expect(compatibilityAction).toContain("default: 'false'");
  });

  it('keeps npm publisher metadata normalized and exposes every CLI alias', async () => {
    const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

    expect(packageJson.repository.url).toBe('git+https://github.com/cucuwang/aeoptimize.git');
    expect(packageJson.bin).toEqual({
      aeoptimize: 'dist/cli/index.js',
      aeo: 'dist/cli/index.js',
      'aeo-cli': 'dist/cli/index.js',
    });
  });
});
