#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { scan, scanDirectory, parseHtml, parseMarkdown, scanUrl } from '../core/scanner.js';
import { audit } from '../core/audit.js';
import { parseSiteReport, summarizeSite } from '../core/site-metrics.js';
import { parseScanReport, renderVisualReport } from '../core/visual-report.js';
import { auditSite } from '../core/site-audit.js';
import { generate } from '../core/generator.js';
import { detectAvailableCLIs, scoreWithAllAvailable } from '../core/external-scorers.js';
import { mergeScores } from '../core/merger.js';
import { auditPath } from '../core/static-audit.js';
import {
  addSeoWatchword,
  initializeSeoWatch,
  loadSeoWatch,
  recordSeoRank,
  reviewSeoExperiment,
  selectSeoCandidate,
  startSeoExperiment,
  summarizeSeoWatch,
  type SeoPriority,
  type SeoRankSource,
  type SeoReviewOutcome,
} from '../core/seo-watch.js';
import type { AuditReport, AuditStatus, SiteAuditReport, ScanReport, MultiAiReport, DimensionScores, ScanTarget, SiteInfo, AiScorerResult } from '../core/types.js';

const HOOK_BEGIN_MARKER = '# BEGIN geoptimize';
const HOOK_END_MARKER = '# END geoptimize';

const program = new Command();

program
  .name('geoptimize')
  .description('Deterministic content-readiness lint for websites and documentation')
  .version('0.10.0');

// ── scan command ───────────────────────────────────────────────────

program
  .command('scan <target>')
  .description('Scan a URL or directory for content-readiness regressions')
  .option('--json', 'Output raw JSON report')
  .option('--dir', 'Treat target as a local directory instead of a URL')
  .option('--details', 'Include rule evidence and up to 6000 characters of source per page')
  .option('--multi-ai', 'Add experimental reviews from available AI CLIs (gemini, copilot)')
  .action(async (target: string, options: { json?: boolean; dir?: boolean; multiAi?: boolean; details?: boolean }) => {
    try {
      if (!target || target.trim().length === 0) {
        console.error(chalk.red('Error: Please provide a URL or directory path.'));
        console.error(chalk.dim('  npx geoptimize scan example.com'));
        console.error(chalk.dim('  npx geoptimize scan ./dist --dir'));
        process.exit(1);
      }
      const scanTarget = resolveTarget(target, options.dir);
      const report = await scan(scanTarget, { details: options.details });

      if (options.multiAi) {
        const multiReport = await runMultiAiScan(report, target, !!options.json);
        if (options.json) {
          console.log(JSON.stringify(multiReport, null, 2));
        } else {
          printMultiAiReport(multiReport);
          printSkillCta();
        }
      } else {
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printReport(report);
          printSkillCta();
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── audit command ─────────────────────────────────────────────────

program
  .command('audit <target>')
  .description('Audit one URL or HTML/Markdown file with evidence-backed checks')
  .option('--json', 'Output the versioned audit JSON contract')
  .action(async (target: string, options: { json?: boolean }) => {
    try {
      if (!target || target.trim().length === 0) {
        console.error(chalk.red('Error: Please provide a URL or HTML/Markdown file.'));
        process.exit(1);
      }

      const auditTarget = resolveTarget(target);
      const report = await audit(auditTarget);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printAuditReport(report);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('audit-site <target>')
  .description('Crawl one origin with bounded evidence-backed site checks')
  .option('--max-pages <count>', 'Maximum page requests from 1 to 200', '20')
  .option('--json', 'Output the versioned site-audit JSON contract')
  .action(async (target: string, options: { maxPages: string; json?: boolean }) => {
    try {
      const resolved = resolveTarget(target);
      if (resolved.type !== 'url') {
        throw new Error('Site audit requires an http or https URL.');
      }
      const report = await auditSite(resolved.path, { maxPages: Number(options.maxPages) });
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printSiteAuditReport(report);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('report <scan-json>')
  .description('Create an offline visual report with the original five readiness scores')
  .requiredOption('--output <path>', 'New HTML output file (existing files are preserved)')
  .option('--site <path>', 'Optional audit-site JSON for website health charts')
  .option('--baseline-site <path>', 'Previous audit-site JSON for count comparisons')
  .option('--baseline <path>', 'Previous detailed scan JSON for readiness scores and source comparisons')
  .action(async (path: string, options: { output: string; site?: string; baselineSite?: string; baseline?: string }) => {
    try {
      const readiness = parseScanReport(JSON.parse(await readFile(path, 'utf-8')));
      const site = options.site ? parseSiteReport(JSON.parse(await readFile(options.site, 'utf-8'))) : undefined;
      const baselineSite = options.baselineSite ? parseSiteReport(JSON.parse(await readFile(options.baselineSite, 'utf-8'))) : undefined;
      const baseline = options.baseline ? parseScanReport(JSON.parse(await readFile(options.baseline, 'utf-8'))) : undefined;
      const html = renderVisualReport(readiness, { site, baselineSite, baseline });
      await writeFile(options.output, html, { flag: 'wx' });
      console.log(`Visual report saved to ${options.output}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command('metrics <report>')
  .description('Summarize saved audit-site JSON and compare a previous scan')
  .option('--baseline <path>', 'Previous audit-site JSON report')
  .option('--json', 'Output metrics and comparison as JSON')
  .action(async (path: string, options: { baseline?: string; json?: boolean }) => {
    try {
      const current = parseSiteReport(JSON.parse(await readFile(path, 'utf-8')));
      const baseline = options.baseline
        ? parseSiteReport(JSON.parse(await readFile(options.baseline, 'utf-8'))) : undefined;
      const report = summarizeSite(current, baseline);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log(chalk.bold('Site Metrics'));
      console.log(`${report.startUrl} | ${report.timestamp}`);
      console.log(report.scope);
      if (report.comparison) {
        console.log(`Baseline: ${report.comparison.baselineTimestamp}`);
        if (!report.comparison.comparable) console.log(`Comparison unavailable: ${report.comparison.reasons.join(' ')}`);
      }
      for (const metric of report.metrics) {
        const change = report.comparison?.changes.find(c => c.id === metric.id);
        const delta = change?.delta;
        const suffix = delta === null || delta === undefined ? '' : ` (${delta > 0 ? '+' : ''}${delta})`;
        console.log(`  ${metric.label.padEnd(39)} ${metric.value === null ? 'Not measured' : `${metric.value} ${metric.unit}`}${suffix}`);
      }
      const findings = report.comparison?.findings;
      if (findings) {
        for (const [label, items] of [
          ['New observations', findings.added],
          ['No longer observed', findings.noLongerObserved],
          ['Still observed', findings.persisting],
        ] as const) {
          console.log(`${label}: ${items.length}`);
          for (const finding of items) console.log(`  ${finding.kind}: ${finding.target}`);
        }
      }
      if (findings) console.log('Absent observations can also reflect changed content or response types; inspect the source audit.');
      console.log('AI mentions, citations, traffic and conversions: Not measured.');
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command('audit-build <path>')
  .description('Audit local built HTML with evidence and optional CI failure on errors')
  .option('--json', 'Output the versioned static audit report as JSON')
  .option('--base-url <url>', 'Deployed page URL, or deployment root for a directory')
  .option('--expect-indexable', 'Treat HTML noindex/none as a failure for this target')
  .option('--fail-on-error', 'Exit 1 when the audit contains FAIL checks; warnings remain advisory')
  .action(async (path: string, options: {
    json?: boolean; baseUrl?: string; expectIndexable?: boolean; failOnError?: boolean;
  }) => {
    try {
      const report = await auditPath(path, options);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('Static HTML Audit');
        console.log(`${report.pages.length} pages | ${report.summary.FAIL} failed | ${report.summary.WARNING} warnings | ${report.summary.PASS} passed | ${report.summary['N/A']} not assessed`);
        for (const page of report.pages) {
          console.log(`\n${page.target}`);
          for (const check of page.checks) {
            console.log(`  [${check.status}] ${check.id}: ${check.message}`);
            for (const evidence of check.evidence) console.log(`    Evidence: ${evidence}`);
            if (check.remediation) console.log(`    Fix: ${check.remediation}`);
            console.log(`    Verify: ${check.validation}`);
          }
        }
        console.log(`\nScope: ${report.limitations.join(' ')}`);
      }
      if (options.failOnError && report.summary.FAIL > 0) process.exitCode = 1;
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

// ── generate command ───────────────────────────────────────────────

program
  .command('generate <dir>')
  .description('Generate optional discovery artifacts (llms.txt proposal, JSON-LD, robots suggestions)')
  .option('--out <dir>', 'Output directory (defaults to input directory)')
  .option('--json', 'Output raw JSON')
  .option('--dry-run', 'Preview without writing files')
  .action(async (dir: string, options: { out?: string; json?: boolean; dryRun?: boolean }) => {
    try {
      const stats = await stat(dir);
      if (!stats.isDirectory()) {
        console.error(chalk.red('Error: Target must be a directory'));
        process.exit(1);
      }

      const report = await scanDirectory(dir);
      if (report.pages.length === 0) {
        console.error(chalk.yellow('No HTML or Markdown files found in directory.'));
        process.exit(1);
      }

      // Re-parse pages to get full ParsedDocument for generator
      const pages = [];
      for (const page of report.pages) {
        try {
          const content = await readFile(page.url, 'utf-8');
          const ext = extname(page.url).toLowerCase();
          if (ext === '.html' || ext === '.htm') {
            pages.push(parseHtml(content, page.url));
          } else {
            pages.push(parseMarkdown(content, page.url));
          }
        } catch {
          // Skip unreadable files
        }
      }

      const siteInfo: SiteInfo = {
        name: detectSiteName(dir, report),
        description: report.pages[0]?.title || 'Website',
        baseUrl: dir,
      };

      // Try to read existing robots.txt
      let existingRobots: string | null = null;
      try {
        existingRobots = await readFile(join(dir, 'robots.txt'), 'utf-8');
      } catch { /* none */ }

      const output = generate(report, pages, siteInfo, existingRobots);

      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      const outDir = options.out || dir;

      // Validate output directory exists and is within a reasonable scope
      if (options.out) {
        try {
          const outStats = await stat(options.out);
          if (!outStats.isDirectory()) {
            console.error(chalk.red('Error: --out must be a directory'));
            process.exit(1);
          }
        } catch {
          console.error(chalk.red(`Error: Output directory "${options.out}" does not exist.`));
          process.exit(1);
        }
      }

      if (options.dryRun) {
        console.log(chalk.cyan.bold('\n📋 Dry Run — Files that would be generated:\n'));
        console.log(chalk.white.bold('llms.txt:'));
        console.log(output.llmsTxt);
        console.log(chalk.white.bold('\nllms-full.txt:'));
        console.log(output.llmsFullTxt.slice(0, 500) + (output.llmsFullTxt.length > 500 ? '\n...' : ''));
        if (output.jsonLd.length > 0) {
          console.log(chalk.white.bold(`\nJSON-LD (${output.jsonLd.length} schemas):`));
          console.log(JSON.stringify(output.jsonLd[0], null, 2).slice(0, 300) + '...');
        }
        console.log(chalk.white.bold('\nrobots.txt suggestions:'));
        console.log(output.robotsTxtSuggestions.join('\n'));
        return;
      }

      // Write files
      await writeFile(join(outDir, 'llms.txt'), output.llmsTxt, 'utf-8');
      await writeFile(join(outDir, 'llms-full.txt'), output.llmsFullTxt, 'utf-8');

      if (output.jsonLd.length > 0) {
        const jsonLdDir = join(outDir, '_geo');
        await mkdir(jsonLdDir, { recursive: true });
        await writeFile(join(jsonLdDir, 'generated-schemas.json'), JSON.stringify(output.jsonLd, null, 2), 'utf-8');
      }

      console.log(chalk.green.bold('\n✅ Generated optional discovery artifacts:\n'));
      console.log(`  ${chalk.white('llms.txt')}         — Experimental site summary (llmstxt.org proposal)`);
      console.log(`  ${chalk.white('llms-full.txt')}    — Experimental full-content companion`);
      if (output.jsonLd.length > 0) {
        console.log(`  ${chalk.white('_geo/generated-schemas.json')} — ${output.jsonLd.length} JSON-LD schemas`);
      }
      console.log(chalk.dim('\nrobots.txt suggestions (not auto-applied):'));
      for (const line of output.robotsTxtSuggestions.filter((l) => l.startsWith('User-agent:'))) {
        console.log(chalk.dim(`  ${line}`));
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── seo command ───────────────────────────────────────────────────

const seoCmd = program
  .command('seo')
  .description('Track evidence-bounded SEO ranking experiments without changing readiness scores');

seoCmd
  .command('init <repository>')
  .description('Create data/seo watchword, rank-history, and improvement-log files')
  .action(async (repository: string) => {
    try {
      await initializeSeoWatch(repository);
      console.log(`SEO watch initialized in ${join(repository, 'data', 'seo')}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

seoCmd
  .command('add <repository>')
  .description('Add one keyword and target page to the watchlist')
  .requiredOption('--keyword <text>', 'Exact query to track')
  .requiredOption('--page <path>', 'Target path or canonical URL')
  .option('--priority <priority>', 'high, medium, or low', 'medium')
  .action(async (repository: string, options: { keyword: string; page: string; priority: SeoPriority }) => {
    try {
      const watchword = await addSeoWatchword(repository, {
        keyword: options.keyword, targetPath: options.page, priority: options.priority,
      });
      console.log(JSON.stringify(watchword, null, 2));
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

seoCmd
  .command('record <repository>')
  .description('Append one fixed-window GSC or observed SERP ranking measurement')
  .requiredOption('--keyword <text>', 'Exact query')
  .requiredOption('--page <path>', 'Target path or canonical URL')
  .requiredOption('--source <source>', 'gsc or serp')
  .requiredOption('--start-date <date>', 'Measurement start date, YYYY-MM-DD')
  .requiredOption('--end-date <date>', 'Measurement end date, YYYY-MM-DD')
  .requiredOption('--country <country>', 'Fixed country segment, such as TWN')
  .requiredOption('--device <device>', 'Fixed device segment, such as DESKTOP')
  .option('--search-type <type>', 'Search type segment', 'web')
  .option('--position <number>', 'Average GSC position or observed organic result position')
  .option('--clicks <number>', 'GSC clicks')
  .option('--impressions <number>', 'GSC impressions')
  .option('--observed-at <timestamp>', 'ISO timestamp for the observation')
  .action(async (repository: string, options: {
    keyword: string; page: string; source: SeoRankSource; startDate: string; endDate: string;
    country: string; device: string; searchType: string; position?: string; clicks?: string;
    impressions?: string; observedAt?: string;
  }) => {
    try {
      const observation = await recordSeoRank(repository, {
        keyword: options.keyword,
        targetPath: options.page,
        source: options.source,
        startDate: options.startDate,
        endDate: options.endDate,
        country: options.country,
        device: options.device,
        searchType: options.searchType,
        position: optionalNumber(options.position, 'position'),
        clicks: optionalNumber(options.clicks, 'clicks'),
        impressions: optionalNumber(options.impressions, 'impressions'),
        observedAt: options.observedAt,
      });
      console.log(JSON.stringify(observation, null, 2));
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

seoCmd
  .command('select <repository>')
  .description('Select exactly one eligible keyword using recorded evidence and priority')
  .option('--json', 'Output JSON')
  .action(async (repository: string, options: { json?: boolean }) => {
    try {
      const candidate = selectSeoCandidate(await loadSeoWatch(repository));
      if (options.json) {
        console.log(JSON.stringify(candidate, null, 2));
      } else if (!candidate) {
        console.log('No keyword selected. An experiment may be observing, every watchword may be achieved, or the watchlist may be empty.');
      } else {
        console.log(`${candidate.watchword.keyword} -> ${candidate.watchword.targetPath}`);
        console.log(candidate.reason);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

seoCmd
  .command('start <repository>')
  .description('Record one publicly deployed page improvement and begin its seven-day cooldown')
  .requiredOption('--keyword <text>', 'The currently selected exact query')
  .requiredOption('--intent <text>', 'Who searched and what they needed')
  .requiredOption('--gap <text>', 'Observed gap against that need')
  .requiredOption('--change <text>', 'Specific completed page change')
  .option('--date <date>', 'Verified publication date, YYYY-MM-DD')
  .action(async (repository: string, options: { keyword: string; intent: string; gap: string; change: string; date?: string }) => {
    try {
      const experiment = await startSeoExperiment(repository, {
        keyword: options.keyword,
        searchIntent: options.intent,
        gap: options.gap,
        change: options.change,
        date: options.date,
      });
      console.log(JSON.stringify(experiment, null, 2));
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

seoCmd
  .command('review <repository>')
  .description('Review a due experiment against a matching post-action observation')
  .requiredOption('--keyword <text>', 'Exact query under review')
  .requiredOption('--outcome <outcome>', 'achieved, improved, unchanged, or declined')
  .requiredOption('--observation <id>', 'Matching rank-history observation ID')
  .option('--note <text>', 'Short evidence note')
  .option('--date <date>', 'Review date, YYYY-MM-DD')
  .action(async (repository: string, options: { keyword: string; outcome: SeoReviewOutcome; observation: string; note?: string; date?: string }) => {
    try {
      const experiment = await reviewSeoExperiment(repository, {
        keyword: options.keyword,
        outcome: options.outcome,
        observationId: options.observation,
        note: options.note,
        date: options.date,
      });
      console.log(JSON.stringify(experiment, null, 2));
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

seoCmd
  .command('status <repository>')
  .description('Summarize active, observing, and achieved SEO experiments')
  .option('--json', 'Output JSON')
  .action(async (repository: string, options: { json?: boolean }) => {
    try {
      const summary = summarizeSeoWatch(await loadSeoWatch(repository));
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(`Active ${summary.counts.active} | Observing ${summary.counts.observing} | Achieved ${summary.counts.achieved} | Observations ${summary.counts.observations}`);
        if (summary.candidate) console.log(`Next candidate: ${summary.candidate.watchword.keyword} -> ${summary.candidate.watchword.targetPath}`);
        for (const item of summary.observing) console.log(`Observing: ${item.keyword} until ${item.nextReviewDate}`);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

// ── hook command ──────────────────────────────────────────────────

const hookCmd = program
  .command('hook')
  .description('Manage pre-commit hook for GEO scoring');

hookCmd
  .command('install')
  .description('Install pre-commit hook that checks the readiness score')
  .option('--min-score <score>', 'Minimum project readiness score (default: 60)', '60')
  .action(async (options: { minScore: string }) => {
    const minScore = parseInt(options.minScore, 10);
    if (isNaN(minScore) || minScore < 0 || minScore > 100) {
      console.error(chalk.red('Error: --min-score must be 0-100'));
      process.exit(1);
    }

    const hookScript = `${HOOK_BEGIN_MARKER}
# geoptimize pre-commit hook — checks readiness of staged HTML/MD files
MIN_SCORE=${minScore}

# Find staged HTML and MD files
FILES=$(git diff --cached --name-only --diff-filter=ACM -- '*.html' '*.htm' '*.md' '*.mdx')
if [ -z "$FILES" ]; then
  exit 0
fi

echo "[geoptimize] Checking content readiness of staged files..."

FAILED=0
OLD_IFS=$IFS
IFS='
'
for FILE in $FILES; do
  [ -n "$FILE" ] || continue
  TEMP_FILE=$(mktemp "\${TMPDIR:-/tmp}/geoptimize.XXXXXX") || exit 1
  if ! git show ":$FILE" > "$TEMP_FILE" 2>/dev/null; then
    rm -f "$TEMP_FILE"
    echo "[geoptimize] WARN: Could not read staged version of $FILE"
    continue
  fi
  SCORE=$(npx geoptimize scan "$TEMP_FILE" --json 2>/dev/null | node -e "
    try { const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(j.overall.total); }
    catch(e) { console.log(-1); }
  ")
  rm -f "$TEMP_FILE"
  if [ "$SCORE" = "-1" ]; then
    continue
  fi
  if [ "$SCORE" -lt "$MIN_SCORE" ]; then
    echo "[geoptimize] FAIL: $FILE scored $SCORE/100 (minimum: $MIN_SCORE)"
    FAILED=1
  else
    echo "[geoptimize] PASS: $FILE scored $SCORE/100"
  fi
done
IFS=$OLD_IFS
if [ "$FAILED" = "1" ]; then
  echo ""
  echo "[geoptimize] Commit blocked. Fix GEO issues or bypass with: git commit --no-verify"
  exit 1
fi
${HOOK_END_MARKER}
`;

    const gitDir = await findGitDir();
    if (!gitDir) {
      console.error(chalk.red('Error: Not a git repository. Run this from a project with .git/'));
      process.exit(1);
    }

    const hookPath = join(gitDir, 'hooks', 'pre-commit');

    await mkdir(join(gitDir, 'hooks'), { recursive: true });

    let existing = '';
    try {
      existing = await readFile(hookPath, 'utf-8');
    } catch {
      // No existing hook yet
    }

    const updated = upsertHookBlock(existing, hookScript);
    const finalHook = ensureHookHasShebang(updated);
    const alreadyInstalled = existing.includes(HOOK_BEGIN_MARKER);

    await writeFile(hookPath, finalHook, { mode: 0o755 });
    console.log(chalk.green(`Pre-commit hook ${alreadyInstalled ? 'updated' : 'installed'} (min score: ${minScore})`));
    console.log(chalk.dim(`  Hook location: ${hookPath}`));
    console.log(chalk.dim(`  To uninstall: npx geoptimize hook uninstall`));
  });

hookCmd
  .command('uninstall')
  .description('Remove geoptimize pre-commit hook')
  .action(async () => {
    const gitDir = await findGitDir();
    if (!gitDir) {
      console.error(chalk.red('Error: Not a git repository.'));
      process.exit(1);
    }

    const hookPath = join(gitDir, 'hooks', 'pre-commit');
    try {
      const existing = await readFile(hookPath, 'utf-8');
      if (!existing.includes(HOOK_BEGIN_MARKER)) {
        console.log(chalk.yellow('No geoptimize hook found.'));
        return;
      }

      const updated = removeHookBlock(existing).trim();
      if (updated.length === 0 || updated === '#!/bin/sh' || updated === '#!/usr/bin/env sh') {
        await writeFile(hookPath, ensureHookHasShebang(''), { mode: 0o755 });
      } else {
        await writeFile(hookPath, `${updated}\n`, { mode: 0o755 });
      }
      console.log(chalk.green('Pre-commit hook removed.'));
    } catch {
      console.log(chalk.yellow('No pre-commit hook found.'));
    }
  });

program.parse();

// ── Helpers ────────────────────────────────────────────────────────

async function findGitDir(): Promise<string | null> {
  const { execSync } = await import('node:child_process');
  try {
    return execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function removeHookBlock(content: string): string {
  const blockPattern = new RegExp(`\\n?${escapeRegExp(HOOK_BEGIN_MARKER)}[\\s\\S]*?${escapeRegExp(HOOK_END_MARKER)}\\n?`, 'g');
  return content.replace(blockPattern, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function upsertHookBlock(existing: string, hookBlock: string): string {
  const withoutBlock = removeHookBlock(existing).trimEnd();
  const parts: string[] = [];
  if (withoutBlock.length > 0) {
    parts.push(withoutBlock);
  }
  parts.push(hookBlock.trim());
  return `${parts.join('\n\n')}\n`;
}

function ensureHookHasShebang(content: string): string {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('#!')) {
    return content.endsWith('\n') ? content : `${content}\n`;
  }

  const body = content.trim().length > 0 ? `\n${content.trim()}\n` : '\n';
  return `#!/bin/sh${body}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveTarget(target: string, isDir?: boolean): ScanTarget {
  if (isDir) {
    return { type: 'directory', path: target };
  }
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return { type: 'url', path: target };
  }
  const extension = extname(target).toLowerCase();
  if (['.html', '.htm', '.md', '.mdx'].includes(extension)) {
    return { type: 'file', path: target };
  }
  // Bare domain (contains a dot, no path separator) → treat as URL
  if (target.includes('.') && !target.includes('/') && !target.includes('\\')) {
    return { type: 'url', path: `https://${target}` };
  }
  // Looks like a local path — hint the user
  if (target.startsWith('./') || target.startsWith('/') || target.startsWith('..')) {
    throw new Error(`"${target}" looks like a local path. Use --dir flag: npx geoptimize scan ${target} --dir`);
  }
  // Fallback: assume URL with https
  return { type: 'url', path: `https://${target}` };
}

function optionalNumber(value: string | undefined, label: string): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

function detectSiteName(dir: string, report: ScanReport): string {
  if (report.pages.length > 0 && report.pages[0].title) {
    const name = report.pages[0].title.split('|')[0].split('-')[0].trim();
    if (name) return name;
  }
  return dir.split('/').filter(Boolean).pop() || 'Website';
}

function printReport(report: ScanReport): void {
  const { overall } = report;

  console.log('');
  console.log(chalk.bold('  Content Readiness Report'));
  console.log(chalk.dim(`  ${report.timestamp}`));
  console.log(chalk.dim(`  ${report.pages.length} page${report.pages.length > 1 ? 's' : ''} scanned`));
  console.log('');

  // Overall score
  const scoreColor = overall.total >= 70 ? chalk.green : overall.total >= 40 ? chalk.yellow : chalk.red;
  console.log(`  ${chalk.bold('Score:')} ${scoreColor.bold(String(overall.total))}${chalk.dim('/100')}  ${report.summary}`);
  console.log('');

  // Dimension breakdown
  printDimensionBar('Structure', overall.structure, 25);
  printDimensionBar('Citability', overall.citability, 25);
  printDimensionBar('Schema', overall.schema, 20);
  printDimensionBar('AI Metadata', overall.aiMetadata, 15);
  printDimensionBar('Content Density', overall.contentDensity, 15);
  console.log('');

  // Top issues
  const allIssues = report.pages.flatMap((p) => p.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === 'critical');
  const warningIssues = allIssues.filter((i) => i.severity === 'warning');

  if (criticalIssues.length > 0) {
    console.log(chalk.red.bold('  Critical Issues:'));
    for (const issue of criticalIssues.slice(0, 5)) {
      console.log(`  ${chalk.red('✗')} ${issue.message}`);
    }
    console.log('');
  }

  if (warningIssues.length > 0) {
    console.log(chalk.yellow.bold('  Warnings:'));
    for (const issue of warningIssues.slice(0, 5)) {
      console.log(`  ${chalk.yellow('!')} ${issue.message}`);
    }
    console.log('');
  }

  // Top suggestions
  const allSuggestions = report.pages.flatMap((p) => p.suggestions);
  const highImpact = allSuggestions.filter((s) => s.impact === 'high');
  if (highImpact.length > 0) {
    console.log(chalk.cyan.bold('  Top Suggestions:'));
    // Deduplicate by action
    const seen = new Set<string>();
    for (const sug of highImpact) {
      if (seen.has(sug.action)) continue;
      seen.add(sug.action);
      console.log(`  ${chalk.cyan('→')} ${sug.action}`);
      console.log(`    ${chalk.dim(sug.detail)}`);
    }
    console.log('');
  }

  // Per-page breakdown if multiple pages
  if (report.pages.length > 1) {
    console.log(chalk.bold('  Per-Page Scores:'));
    for (const page of report.pages.sort((a, b) => a.scores.total - b.scores.total)) {
      const color = page.scores.total >= 70 ? chalk.green : page.scores.total >= 40 ? chalk.yellow : chalk.red;
      const name = page.title.length > 40 ? page.title.slice(0, 37) + '...' : page.title;
      console.log(`  ${color(String(page.scores.total).padStart(3))} ${name}`);
    }
    console.log('');
  }
}

function auditStatusColor(status: AuditStatus): (value: string) => string {
  switch (status) {
    case 'PASS': return chalk.green;
    case 'WARNING': return chalk.yellow;
    case 'FAIL': return chalk.red;
    case 'N/A': return chalk.gray;
  }
}

function printAuditReport(report: AuditReport): void {
  console.log('');
  console.log(chalk.bold('  Evidence-backed Page Audit'));
  console.log(chalk.dim(`  Contract ${report.contractVersion} | ${report.timestamp}`));
  console.log(chalk.dim(`  ${report.target.finalUrl ?? report.target.input}`));
  console.log('');
  console.log(
    `  ${chalk.green(`PASS ${report.summary.PASS}`)}  ` +
    `${chalk.yellow(`WARNING ${report.summary.WARNING}`)}  ` +
    `${chalk.red(`FAIL ${report.summary.FAIL}`)}  ` +
    `${chalk.gray(`N/A ${report.summary['N/A']}`)}`,
  );
  console.log('');

  for (const check of report.checks) {
    const color = auditStatusColor(check.status);
    console.log(`  ${color(`[${check.status}]`)} ${chalk.bold(check.label)} ${chalk.dim(`(${check.id})`)}`);
    console.log(`    ${check.explanation}`);
    for (const item of check.evidence) {
      const observed = JSON.stringify(item.observed);
      console.log(chalk.dim(`    Evidence ${item.source}: ${observed}`));
    }
    if (check.remediation) console.log(`    ${chalk.cyan('Fix:')} ${check.remediation}`);
    console.log(chalk.dim(`    Validate: ${check.validation}`));
    console.log('');
  }

  console.log(chalk.bold('  Limits'));
  for (const limitation of report.limitations) {
    console.log(chalk.dim(`  - ${limitation}`));
  }
  console.log('');
}

function printSiteAuditReport(report: SiteAuditReport): void {
  console.log('');
  console.log(chalk.bold('  Bounded Site Audit'));
  console.log(chalk.dim(`  Contract ${report.contractVersion} | ${report.timestamp}`));
  console.log(chalk.dim(`  ${report.startUrl} | ${report.crawledPages}/${report.maxPages} pages`));
  console.log('');
  console.log(
    `  ${chalk.green(`PASS ${report.summary.PASS}`)}  ` +
    `${chalk.yellow(`WARNING ${report.summary.WARNING}`)}  ` +
    `${chalk.red(`FAIL ${report.summary.FAIL}`)}  ` +
    `${chalk.gray(`N/A ${report.summary['N/A']}`)}`,
  );
  console.log('');

  for (const item of report.checks) {
    const color = auditStatusColor(item.status);
    console.log(`  ${color(`[${item.status}]`)} ${chalk.bold(item.label)} ${chalk.dim(`(${item.id})`)}`);
    console.log(`    ${item.explanation}`);
    for (const itemEvidence of item.evidence) {
      console.log(chalk.dim(`    Evidence ${itemEvidence.source}: ${JSON.stringify(itemEvidence.observed)}`));
    }
    if (item.remediation) console.log(`    ${chalk.cyan('Fix:')} ${item.remediation}`);
    console.log(chalk.dim(`    Validate: ${item.validation}`));
    console.log('');
  }

  console.log(chalk.bold('  Pages'));
  for (const page of report.pages) {
    const status = page.status >= 200 && page.status < 300 ? chalk.green(String(page.status)) : chalk.red(String(page.status));
    console.log(`  ${status} ${page.requestedUrl}${page.finalUrl !== page.requestedUrl ? ` -> ${page.finalUrl}` : ''}`);
  }
  console.log('');
  console.log(chalk.bold('  Limits'));
  for (const limitation of report.limitations) console.log(chalk.dim(`  - ${limitation}`));
  console.log('');
}

function printDimensionBar(label: string, score: number, max: number): void {
  const pct = score / max;
  const barWidth = 20;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const color = pct >= 0.7 ? chalk.green : pct >= 0.4 ? chalk.yellow : chalk.red;

  const bar = color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const labelPad = label.padEnd(16);
  console.log(`  ${labelPad} ${bar} ${color(String(score))}${chalk.dim('/' + max)}`);
}

async function runMultiAiScan(ruleReport: ScanReport, target: string, silent = false): Promise<MultiAiReport> {
  if (!silent) console.log(chalk.dim('\n  Detecting AI CLIs...'));
  const available = await detectAvailableCLIs();

  const found: string[] = [];
  if (available.gemini) found.push('gemini');
  if (available.copilot) found.push('copilot');

  if (!silent) {
    if (found.length > 0) {
      console.log(chalk.dim(`  Found: ${found.join(', ')}`));
      console.log(chalk.dim('  Requesting AI scores (this may take a moment)...\n'));
    } else {
      console.log(chalk.dim('  No external AI CLIs found. Using rule engine only.\n'));
    }
  }

  // Resolve target URL for fetching HTML
  const url = resolveTargetUrl(target);
  let html = '';
  if (url) {
    try {
      const response = await fetch(url);
      html = await response.text();
    } catch {
      // Fall through with empty html
    }
  }

  const aiScores = html ? await scoreWithAllAvailable(html, url || target, available) : [];
  return mergeScores(ruleReport, aiScores);
}

function resolveTargetUrl(target: string): string | null {
  if (target.startsWith('http://') || target.startsWith('https://')) return target;
  if (target.includes('.') && !target.includes('/') && !target.includes('\\')) return `https://${target}`;
  return null;
}

function printMultiAiReport(report: MultiAiReport): void {
  const { overall } = report;

  console.log('');
  console.log(chalk.bold('  Content Readiness Report (Experimental AI Review)'));
  console.log(chalk.dim(`  ${report.timestamp}`));
  console.log(chalk.dim(`  ${report.pages.length} page${report.pages.length > 1 ? 's' : ''} scanned`));
  console.log(chalk.dim(`  ${report.methodology}`));
  console.log('');

  // Blended review score. AI reviewers are experimental and do not establish ground truth.
  const scoreColor = report.consensusScore >= 70 ? chalk.green : report.consensusScore >= 40 ? chalk.yellow : chalk.red;
  const availableScores = report.aiScores.filter((s) => s.available);
  const aiReviewMean = availableScores.length > 0
    ? String(Math.round(availableScores.reduce((sum, s) => sum + s.score, 0) / availableScores.length))
    : 'N/A';
  console.log(`  ${chalk.bold('Experimental blend:')} ${scoreColor.bold(String(report.consensusScore))}${chalk.dim('/100')} (Rules: ${report.ruleScore} | AI review mean: ${aiReviewMean})`);
  console.log('');

  // Source breakdown
  console.log(chalk.bold('  Scorer Breakdown:'));
  printScoreBar('Rule Engine', report.ruleScore, 100);
  for (const ai of report.aiScores) {
    if (ai.available) {
      const label = ai.source.charAt(0).toUpperCase() + ai.source.slice(1);
      printScoreBar(label, ai.score, 100);
    }
  }
  console.log('');

  // Dimension breakdown (from rule engine — averaged if multiple pages)
  console.log(chalk.bold('  Dimension Breakdown (Rule Engine):'));
  const dims = report.pages.length === 1
    ? report.pages[0].scores
    : { structure: Math.round(report.pages.reduce((s, p) => s + p.scores.structure, 0) / report.pages.length), citability: Math.round(report.pages.reduce((s, p) => s + p.scores.citability, 0) / report.pages.length), schema: Math.round(report.pages.reduce((s, p) => s + p.scores.schema, 0) / report.pages.length), aiMetadata: Math.round(report.pages.reduce((s, p) => s + p.scores.aiMetadata, 0) / report.pages.length), contentDensity: Math.round(report.pages.reduce((s, p) => s + p.scores.contentDensity, 0) / report.pages.length), total: 0 };
  printDimensionBar('Structure', dims.structure, 25);
  printDimensionBar('Citability', dims.citability, 25);
  printDimensionBar('Schema', dims.schema, 20);
  printDimensionBar('AI Metadata', dims.aiMetadata, 15);
  printDimensionBar('Content Density', dims.contentDensity, 15);
  console.log('');

  // AI Insights
  const availableAi = report.aiScores.filter((s) => s.available && s.insight);
  if (availableAi.length > 0) {
    console.log(chalk.magenta.bold('  AI Insights:'));
    for (const ai of availableAi) {
      const label = ai.source.charAt(0).toUpperCase() + ai.source.slice(1);
      console.log(`  ${chalk.magenta(label + ':')} ${ai.insight}`);
    }
    console.log('');
  }

  // Issues and suggestions from rule engine
  const allIssues = report.pages.flatMap((p) => p.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    console.log(chalk.red.bold('  Critical Issues:'));
    for (const issue of criticalIssues.slice(0, 5)) {
      console.log(`  ${chalk.red('✗')} ${issue.message}`);
    }
    console.log('');
  }

  const allSuggestions = report.pages.flatMap((p) => p.suggestions);
  const highImpact = allSuggestions.filter((s) => s.impact === 'high');
  if (highImpact.length > 0) {
    console.log(chalk.cyan.bold('  Top Suggestions:'));
    const seen = new Set<string>();
    for (const sug of highImpact) {
      if (seen.has(sug.action)) continue;
      seen.add(sug.action);
      console.log(`  ${chalk.cyan('→')} ${sug.action}`);
      console.log(`    ${chalk.dim(sug.detail)}`);
    }
    console.log('');
  }
}

function printScoreBar(label: string, score: number, max: number): void {
  const pct = score / max;
  const barWidth = 20;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const color = pct >= 0.7 ? chalk.green : pct >= 0.4 ? chalk.yellow : chalk.red;

  const bar = color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const labelPad = label.padEnd(16);
  console.log(`  ${labelPad} ${bar} ${color(String(score))}${chalk.dim('/' + max)}`);
}

function printSkillCta(): void {
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(chalk.dim('  Want AI-powered fixes? Install as Claude Code skill:'));
  console.log(chalk.white('    claude plugin marketplace add cucuwang/geoptimize'));
  console.log(chalk.dim('  Then use: /geo-scan, /geo-generate, /geo-transform'));
  console.log('');
}
