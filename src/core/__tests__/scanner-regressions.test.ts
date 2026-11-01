import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditDocument } from '../audit.js';
import { parseMarkdown, scan, scanDirectory, scanDocument } from '../scanner.js';
import { parseScanReport } from '../visual-report.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'geoptimize-scanner-regression-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('directory scan failures (F1)', () => {
  it.each([false, true])('rejects an oversized file with its path, mixed directory=%s', async (mixed) => {
    const directory = await temporaryDirectory();
    const oversized = join(directory, 'oversized.html');
    await writeFile(oversized, '');
    await truncate(oversized, 5 * 1024 * 1024 + 1);
    if (mixed) await writeFile(join(directory, 'a-valid.md'), '# Valid page');

    const error = await scanDirectory(directory).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(oversized);
    expect(error.message).toContain('File too large');
  });

  it('propagates a nested Markdown parse failure with its path', async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, 'nested'));
    const invalid = join(directory, 'nested', 'invalid.md');
    await writeFile(invalid, '---\ntitle: [unterminated\n---\n# Broken');

    await expect(scan({ type: 'directory', path: directory })).rejects.toThrow(invalid);
  });

  it('retains the empty-directory report when no supported files exist', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'ignored.txt'), 'Not a supported source');
    expect(await scanDirectory(directory)).toMatchObject({
      pages: [], summary: 'No HTML or Markdown files found in directory.',
    });
  });
});

describe('Markdown fenced code (F3)', () => {
  it.each(['```', '~~~', '````', '~~~~'])('excludes %s fenced code from every content extractor', (fence) => {
    const doc = parseMarkdown([
      '# Real', '', 'Before the example.', `${fence}md`, '### Example',
      '[bad](javascript:example)', '![example](example.png)', 'Hidden paragraph.',
      fence, 'After the example.', '', '[Good](/guide)', '![Real](real.png)',
    ].join('\n'), 'guide.md');

    expect(doc.headings).toEqual([{ level: 1, text: 'Real' }]);
    expect(doc.links).toEqual([{ text: 'Good', href: '/guide' }]);
    expect(doc.images).toEqual([{ alt: 'Real', src: 'real.png' }]);
    expect(doc.paragraphs).toContain('Before the example.');
    expect(doc.paragraphs).toContain('After the example.');
    expect(doc.paragraphs.join(' ')).not.toContain('Hidden');
    expect(doc.rawText).not.toMatch(/Example|Hidden|javascript|example\.png/);
    expect(scanDocument(doc).issues.some(issue => issue.message.includes('Heading level skipped'))).toBe(false);
  });

  it.each([
    ['````md', '```'],
    ['~~~md', '```'],
    ['```md', '```not a closing fence'],
  ])('keeps %s open after the non-closing line %s', (opening, nonClosing) => {
    const doc = parseMarkdown([
      '# Real', opening, nonClosing, '### Still code', '[bad](javascript:example)',
      opening.startsWith('~') ? '~~~~' : '`````', '## Visible',
    ].join('\n'), 'guide.md');

    expect(doc.headings).toEqual([{ level: 1, text: 'Real' }, { level: 2, text: 'Visible' }]);
    expect(doc.links).toEqual([]);
    expect(doc.rawText).not.toContain('Still code');
  });

  it('excludes an unclosed indented fence through the end of the document', () => {
    const doc = parseMarkdown('# Real\r\n  ~~~md\r\n### Hidden\r\n[bad](javascript:example)', 'guide.md');
    expect(doc.headings).toEqual([{ level: 1, text: 'Real' }]);
    expect(doc.links).toEqual([]);
    expect(doc.paragraphs).toEqual([]);
    expect(doc.rawText).toBe('Real');
  });
});

describe('Markdown frontmatter title types (F4)', () => {
  it.each(['2026', 'true', '[one, two]', '{name: example}', 'null'])('falls back to H1 for the non-string YAML title %s', (title) => {
    const doc = parseMarkdown(`---\ntitle: ${title}\n---\n# Actual title`, 'guide.md');
    expect(doc.title).toBe('Actual title');
    expect(doc.documentTitle).toBeUndefined();
    const page = scanDocument(doc);
    const report = { pages: [page], overall: page.scores, summary: 'Fixture', timestamp: new Date().toISOString() };
    expect(parseScanReport(JSON.parse(JSON.stringify(report))).pages[0].title).toBe('Actual title');
    expect(auditDocument(doc, {
      target: { type: 'file', input: doc.url }, rendering: 'markdown',
    }).checks.find(check => check.id === 'document-title')?.status).toBe('PASS');
  });

  it('uses the source path when a non-string title has no H1 fallback', () => {
    expect(parseMarkdown('---\ntitle: 2026\n---\nBody', 'guide.md').title).toBe('guide.md');
  });

  it('preserves an explicitly quoted numeric string title', () => {
    expect(parseMarkdown('---\ntitle: "2026"\n---\n# Actual title', 'guide.md').title).toBe('2026');
  });
});
