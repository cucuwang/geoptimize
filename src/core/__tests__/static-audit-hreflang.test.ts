import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditPath } from '../static-audit.js';

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('static duplicate titles with hreflang', () => {
  describe.each(['index.html', 'index.htm'])('directory layout with %s', (filename) => {
    it.each(['reciprocal', 'reciprocal-index-target', 'one-way', 'none'])(
      'requires reciprocal directory hreflang links: %s', async (mode) => {
        directory = await mkdtemp(join(tmpdir(), 'geoptimize-hreflang-'));
        const paths = ['tw/insights/', 'cn/insights/'];
        const languages = ['zh-TW', 'zh-CN'];
        for (const [index, path] of paths.entries()) {
          await mkdir(join(directory, path), { recursive: true });
          const target = `${paths[1 - index]}${mode === 'reciprocal-index-target' && index === 0 ? filename : ''}`;
          const alternate = mode === 'none' || (mode === 'one-way' && index === 1) ? ''
            : `<link rel="alternate" hreflang="${languages[1 - index]}" href="https://example.com/${target}">`;
          await writeFile(join(directory, path, filename), `<html lang="${languages[index]}"><head><title>洞察｜Example</title>
            <link rel="canonical" href="https://example.com/${path}">${alternate}
            </head><body>Content</body></html>`);
        }
        const report = await auditPath(directory, { baseUrl: 'https://example.com/' });
        const duplicates = report.pages.flatMap(p => p.checks.filter(c => c.id === 'duplicate-document-title'));
        expect(duplicates).toHaveLength(mode.startsWith('reciprocal') ? 0 : 2);
        expect(duplicates.every(c => c.status === 'WARNING')).toBe(true);
        for (const page of report.pages) {
          const path = paths.find(p => page.target === join(directory!, p, filename))!;
          expect(path).toBeDefined();
          expect(page.checks.find(c => c.id === 'canonical')?.evidence).toEqual([`https://example.com/${path}`]);
        }
      },
    );
  });

  it.each(['reciprocal', 'one-way', 'none', 'same-language', 'wrong-language', 'no-base', 'partial-group'])(
    'requires verified reciprocal links between different languages: %s', async (mode) => {
      directory = await mkdtemp(join(tmpdir(), 'geoptimize-hreflang-'));
      const files = mode === 'partial-group' ? ['tw.html', 'cn.html', 'en.html'] : ['tw.html', 'cn.html'];
      const languages = ['zh-TW', mode === 'same-language' ? 'zh-TW' : 'zh-CN', 'en'];
      for (const [index, file] of files.entries()) {
        const targets = mode === 'none' || (mode === 'one-way' && index === 1) ? []
          : mode === 'partial-group' ? [1] : [1 - index];
        await writeFile(join(directory, file), `<html lang="${languages[index]}"><head><title>洞察｜Example</title>
          <link rel="canonical" href="https://example.com/${file}">
          ${targets.map(i => `<link rel="alternate" hreflang="${mode === 'wrong-language' ? 'fr' : languages[i]}" href="${files[i]}">`).join('')}
          </head><body>Content</body></html>`);
      }
      const report = await auditPath(directory, mode === 'no-base' ? {} : { baseUrl: 'https://example.com/' });
      const duplicates = report.pages.flatMap(p => p.checks.filter(c => c.id === 'duplicate-document-title'));
      expect(duplicates).toHaveLength(mode === 'reciprocal' ? 0 : files.length);
      expect(duplicates.every(c => c.status === 'WARNING')).toBe(true);
    },
  );
});
