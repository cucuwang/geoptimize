import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { scanDirectory, parseHtml, parseMarkdown } from '../core/scanner.js';
import { generate } from '../core/generator.js';
import type { ParsedDocument, SiteInfo } from '../core/types.js';

export function geoPlugin(options?: { silent?: boolean; outDir?: string }) {
  let resolvedOutDir = 'dist';
  return {
    name: 'geoptimize',
    configResolved(config: { build: { outDir: string } }) {
      resolvedOutDir = config.build.outDir;
    },
    async closeBundle() {
      const outDir = options?.outDir || resolvedOutDir;
      const report = await scanDirectory(outDir);
      if (report.pages.length === 0) {
        if (!options?.silent) console.log('[geoptimize] No pages found in build output.');
        return;
      }

      const pages: ParsedDocument[] = [];
      for (const page of report.pages) {
        try {
          const content = await readFile(page.url, 'utf-8');
          const ext = extname(page.url).toLowerCase();
          pages.push(ext === '.md' || ext === '.mdx' ? parseMarkdown(content, page.url) : parseHtml(content, page.url));
        } catch { /* skip unreadable */ }
      }

      const siteInfo: SiteInfo = {
        name: pages[0]?.title?.split('|')[0]?.trim() || 'Site',
        description: pages[0]?.metaTags?.description || '',
        baseUrl: outDir,
      };

      const output = generate(report, pages, siteInfo);
      await writeFile(join(outDir, 'llms.txt'), output.llmsTxt, 'utf-8');
      await writeFile(join(outDir, 'llms-full.txt'), output.llmsFullTxt, 'utf-8');
      if (output.jsonLd.length > 0) {
        await mkdir(join(outDir, '_geo'), { recursive: true });
        await writeFile(join(outDir, '_geo', 'generated-schemas.json'), JSON.stringify(output.jsonLd, null, 2), 'utf-8');
      }

      if (!options?.silent) {
        console.log(`[geoptimize] Readiness score: ${report.overall.total}/100 (${report.pages.length} pages)`);
        console.log(`[geoptimize] Generated optional artifacts: llms.txt, llms-full.txt${output.jsonLd.length ? ', _geo/generated-schemas.json' : ''}`);
      }
    },
  };
}
