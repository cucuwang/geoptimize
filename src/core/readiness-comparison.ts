import type { DimensionScores, PageAnalysis, ScanReport } from './types.js';
import { allRules } from './rules.js';
import { SCORING_VERSION } from './scanner.js';

const dimensions = [
  ['structure', 'Structure', 25], ['citability', 'Citability', 25],
  ['schema', 'Schema', 20], ['aiMetadata', 'AI Metadata', 15],
  ['contentDensity', 'Content Density', 15],
] as const;

/** Verify opt-in evidence against the versioned rule roster and original aggregation. */
export function validateReadinessDetails(report: ScanReport): void {
  const validScores = (s: DimensionScores) => s && dimensions.every(([key, , maximum]) =>
    Number.isInteger(s[key]) && s[key] >= 0 && s[key] <= maximum) &&
    Number.isInteger(s.total) && s.total === dimensions.reduce((sum, [key]) => sum + s[key], 0);
  if (!report || !Array.isArray(report.pages) || !validScores(report.overall) ||
      typeof report.timestamp !== 'string' || !Number.isFinite(Date.parse(report.timestamp)) ||
      report.pages.some(p => !p || typeof p.url !== 'string' || !validScores(p.scores))) {
    throw new Error('Invalid readiness scores or timestamp.');
  }
  if (dimensions.some(([key]) => report.overall[key] !== (report.pages.length
    ? Math.round(report.pages.reduce((sum, page) => sum + page.scores[key], 0) / report.pages.length) : 0))) {
    throw new Error('Overall readiness does not match page averages.');
  }
  if (new Set(report.pages.map(p => p.url)).size !== report.pages.length) throw new Error('Readiness page URLs must be unique.');
  if (report.scoringVersion !== undefined && report.scoringVersion !== SCORING_VERSION) throw new Error('Unsupported readiness scoring version.');
  for (const page of report.pages) {
    const preview = page.sourcePreview;
    if (preview !== undefined && (!preview || typeof preview.text !== 'string' || preview.text.length > 6000 ||
        typeof preview.truncated !== 'boolean' || !['html', 'markdown'].includes(preview.format) ||
        !['local-file', 'response-html', 'browser-rendered-html', 'provided-html', 'markdown'].includes(preview.capture) ||
        (preview.capture === 'markdown') !== (preview.format === 'markdown'))) throw new Error('Invalid bounded source preview.');
    const evidence = page.ruleResults;
    if (evidence === undefined && report.scoringVersion === undefined) continue;
    if (report.scoringVersion !== SCORING_VERSION || !Array.isArray(evidence) || evidence.length !== allRules.length ||
        new Set(evidence.map(r => r?.id)).size !== allRules.length) throw new Error('Detailed scans require the complete versioned rule evidence.');
    for (const rule of allRules) {
      const item = evidence.find(r => r.id === rule.id);
      if (!item || item.dimension !== rule.dimension || item.weight !== rule.weight ||
          !Number.isFinite(item.score) || !Number.isFinite(item.maxScore) || item.maxScore < 0 || item.score < 0 || item.score > item.maxScore ||
          !Array.isArray(item.issues) || item.issues.some(i => !i || typeof i.message !== 'string' || !['critical', 'warning', 'info'].includes(i.severity)) ||
          !Array.isArray(item.suggestions) || item.suggestions.some(s => !s || typeof s.action !== 'string' || typeof s.detail !== 'string')) {
        throw new Error(`Invalid evidence for readiness rule ${rule.id}.`);
      }
    }
    for (const [key] of dimensions) {
      const entries = evidence.filter(r => r.dimension === key);
      const maximum = entries.reduce((sum, r) => sum + r.maxScore, 0);
      const weight = entries.reduce((sum, r) => sum + r.weight, 0);
      const actual = maximum > 0 ? Math.round(entries.reduce((sum, r) => sum + r.score, 0) / maximum * weight) : 0;
      if (page.scores[key] !== actual) throw new Error(`Rule evidence does not reproduce ${key} score.`);
    }
  }
}

export interface ReadinessComparison {
  comparable: boolean;
  reasons: string[];
  changes: { key: keyof DimensionScores; label: string; max: number; before: number; after: number; delta: number | null }[];
  pages: { url: string; before: PageAnalysis; after: PageAnalysis }[];
}

export function compareReadiness(current: ScanReport, baseline: ScanReport): ReadinessComparison {
  validateReadinessDetails(current);
  validateReadinessDetails(baseline);
  const reasons: string[] = [];
  if (!current.scoringVersion || current.scoringVersion !== baseline.scoringVersion) reasons.push('Comparable scans need the same scoring version. Re-scan with --details.');
  if (!current.pages.length || !baseline.pages.length) reasons.push('A readiness scan has no scored pages.');
  const urls = (r: ScanReport) => JSON.stringify(r.pages.map(p => p.url).sort());
  if (urls(current) !== urls(baseline)) reasons.push('Scored page URL sets differ. Use the same targets for both scans.');
  if (Date.parse(current.timestamp) < Date.parse(baseline.timestamp)) reasons.push('Baseline is newer than the current readiness scan.');
  const comparable = reasons.length === 0;
  const entries: [keyof DimensionScores, string, number][] = [['total', 'Overall readiness', 100], ...dimensions.map(([key, label, max]): [keyof DimensionScores, string, number] => [key, label, max])];
  const previous = new Map(baseline.pages.map(p => [p.url, p]));
  return {
    comparable, reasons,
    changes: entries.map(([key, label, max]) => ({ key, label, max, before: baseline.overall[key], after: current.overall[key], delta: comparable ? current.overall[key] - baseline.overall[key] : null })),
    pages: comparable ? current.pages.map(after => ({ url: after.url, before: previous.get(after.url)!, after })) : [],
  };
}
