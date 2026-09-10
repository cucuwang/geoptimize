import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const SEO_WATCH_CONTRACT_VERSION = '1.0' as const;
export const SEO_WATCH_DIRECTORY = join('data', 'seo');
export const SEO_WATCH_FILES = {
  watchwords: 'watchwords.json',
  rankHistory: 'rank-history.json',
  improvementLog: 'improvement-log.json',
} as const;

export type SeoPriority = 'high' | 'medium' | 'low';
export type SeoWatchStatus = 'active' | 'observing' | 'achieved';
export type SeoRankSource = 'gsc' | 'serp';
export type SeoReviewOutcome = 'achieved' | 'improved' | 'unchanged' | 'declined';

export interface SeoWatchword {
  keyword: string;
  targetPath: string;
  priority: SeoPriority;
  status: SeoWatchStatus;
  nextReviewDate: string | null;
}

export interface SeoWatchwordsFile {
  contractVersion: typeof SEO_WATCH_CONTRACT_VERSION;
  watchwords: SeoWatchword[];
}

export interface SeoRankObservation {
  id: string;
  observedAt: string;
  source: SeoRankSource;
  keyword: string;
  targetPath: string;
  position: number | null;
  clicks: number | null;
  impressions: number | null;
  window: {
    startDate: string;
    endDate: string;
  };
  segment: {
    country: string;
    device: string;
    searchType: string;
  };
}

export interface SeoRankHistoryFile {
  contractVersion: typeof SEO_WATCH_CONTRACT_VERSION;
  observations: SeoRankObservation[];
}

export interface SeoImprovementAction {
  date: string;
  baselineObservationId: string | null;
  searchIntent: string;
  gap: string;
  change: string;
}

export interface SeoImprovementReview {
  date: string;
  outcome: SeoReviewOutcome;
  observationId: string;
  note: string;
}

export interface SeoImprovement {
  keyword: string;
  targetPath: string;
  status: SeoWatchStatus;
  nextReviewDate: string | null;
  actions: SeoImprovementAction[];
  reviews: SeoImprovementReview[];
}

export interface SeoImprovementLogFile {
  contractVersion: typeof SEO_WATCH_CONTRACT_VERSION;
  improvements: SeoImprovement[];
}

export interface SeoWatchState {
  watchwords: SeoWatchwordsFile;
  rankHistory: SeoRankHistoryFile;
  improvementLog: SeoImprovementLogFile;
}

export interface SeoCandidate {
  watchword: SeoWatchword;
  latestObservation: SeoRankObservation | null;
  reason: string;
}

export interface RecordSeoRankInput {
  keyword: string;
  targetPath: string;
  source: SeoRankSource;
  position?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  startDate: string;
  endDate: string;
  country: string;
  device: string;
  searchType?: string;
  observedAt?: string;
}

export interface StartSeoExperimentInput {
  keyword: string;
  searchIntent: string;
  gap: string;
  change: string;
  date?: string;
}

export interface ReviewSeoExperimentInput {
  keyword: string;
  outcome: SeoReviewOutcome;
  observationId: string;
  note?: string;
  date?: string;
}

const priorityWeight: Record<SeoPriority, number> = { high: 0, medium: 1, low: 2 };

function text(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  return normalized;
}

function dateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  return value;
}

function timestamp(value: string, label: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp.`);
  return new Date(value).toISOString();
}

function nullableNonNegative(value: number | null | undefined, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
  return value;
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sameWatchword(left: Pick<SeoWatchword, 'keyword' | 'targetPath'>, right: Pick<SeoWatchword, 'keyword' | 'targetPath'>): boolean {
  return normalizeKeyword(left.keyword) === normalizeKeyword(right.keyword) && left.targetPath === right.targetPath;
}

function sameSegment(left: SeoRankObservation, right: SeoRankObservation): boolean {
  return left.source === right.source
    && left.segment.country === right.segment.country
    && left.segment.device === right.segment.device
    && left.segment.searchType === right.segment.searchType;
}

function dayAfter(value: string, days: number): string {
  const date = new Date(`${dateOnly(value, 'date')}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyState(): SeoWatchState {
  return {
    watchwords: { contractVersion: SEO_WATCH_CONTRACT_VERSION, watchwords: [] },
    rankHistory: { contractVersion: SEO_WATCH_CONTRACT_VERSION, observations: [] },
    improvementLog: { contractVersion: SEO_WATCH_CONTRACT_VERSION, improvements: [] },
  };
}

function paths(repository: string) {
  const directory = join(repository, SEO_WATCH_DIRECTORY);
  return {
    directory,
    watchwords: join(directory, SEO_WATCH_FILES.watchwords),
    rankHistory: join(directory, SEO_WATCH_FILES.rankHistory),
    improvementLog: join(directory, SEO_WATCH_FILES.improvementLog),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertRepository(repository: string): Promise<void> {
  const info = await stat(repository);
  if (!info.isDirectory()) throw new Error('Repository path must be a directory.');
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(tempPath, path);
}

function assertVersion(value: unknown, label: string): void {
  if (value !== SEO_WATCH_CONTRACT_VERSION) {
    throw new Error(`${label} contractVersion must be ${SEO_WATCH_CONTRACT_VERSION}.`);
  }
}

function assertState(state: SeoWatchState): void {
  assertVersion(state.watchwords.contractVersion, SEO_WATCH_FILES.watchwords);
  assertVersion(state.rankHistory.contractVersion, SEO_WATCH_FILES.rankHistory);
  assertVersion(state.improvementLog.contractVersion, SEO_WATCH_FILES.improvementLog);
  if (!Array.isArray(state.watchwords.watchwords)) throw new Error('watchwords must be an array.');
  if (!Array.isArray(state.rankHistory.observations)) throw new Error('observations must be an array.');
  if (!Array.isArray(state.improvementLog.improvements)) throw new Error('improvements must be an array.');
}

export async function initializeSeoWatch(repository: string): Promise<SeoWatchState> {
  await assertRepository(repository);
  const target = paths(repository);
  const existing = await Promise.all([
    exists(target.watchwords),
    exists(target.rankHistory),
    exists(target.improvementLog),
  ]);
  if (existing.some(Boolean)) {
    throw new Error(`SEO watch data already exists in ${target.directory}; existing files were preserved.`);
  }

  await mkdir(target.directory, { recursive: true });
  const state = emptyState();
  await writeFile(target.watchwords, `${JSON.stringify(state.watchwords, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(target.rankHistory, `${JSON.stringify(state.rankHistory, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(target.improvementLog, `${JSON.stringify(state.improvementLog, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return state;
}

export async function loadSeoWatch(repository: string): Promise<SeoWatchState> {
  await assertRepository(repository);
  const target = paths(repository);
  const [watchwords, rankHistory, improvementLog] = await Promise.all([
    readFile(target.watchwords, 'utf8').then(JSON.parse) as Promise<SeoWatchwordsFile>,
    readFile(target.rankHistory, 'utf8').then(JSON.parse) as Promise<SeoRankHistoryFile>,
    readFile(target.improvementLog, 'utf8').then(JSON.parse) as Promise<SeoImprovementLogFile>,
  ]);
  const state = { watchwords, rankHistory, improvementLog };
  assertState(state);
  return state;
}

async function saveSeoWatch(repository: string, state: SeoWatchState): Promise<void> {
  assertState(state);
  const target = paths(repository);
  await atomicJson(target.watchwords, state.watchwords);
  await atomicJson(target.rankHistory, state.rankHistory);
  await atomicJson(target.improvementLog, state.improvementLog);
}

export async function addSeoWatchword(
  repository: string,
  input: { keyword: string; targetPath: string; priority?: SeoPriority },
): Promise<SeoWatchword> {
  const state = await loadSeoWatch(repository);
  const watchword: SeoWatchword = {
    keyword: text(input.keyword, 'keyword'),
    targetPath: text(input.targetPath, 'targetPath'),
    priority: input.priority ?? 'medium',
    status: 'active',
    nextReviewDate: null,
  };
  if (!['high', 'medium', 'low'].includes(watchword.priority)) throw new Error('priority must be high, medium, or low.');
  if (state.watchwords.watchwords.some((item) => normalizeKeyword(item.keyword) === normalizeKeyword(watchword.keyword))) {
    throw new Error(`Watchword already exists for ${watchword.keyword}; one exact query must map to one target page.`);
  }
  state.watchwords.watchwords.push(watchword);
  state.improvementLog.improvements.push({
    keyword: watchword.keyword,
    targetPath: watchword.targetPath,
    status: 'active',
    nextReviewDate: null,
    actions: [],
    reviews: [],
  });
  await saveSeoWatch(repository, state);
  return watchword;
}

export async function recordSeoRank(repository: string, input: RecordSeoRankInput): Promise<SeoRankObservation> {
  const state = await loadSeoWatch(repository);
  const keyword = text(input.keyword, 'keyword');
  const targetPath = text(input.targetPath, 'targetPath');
  const watchword = state.watchwords.watchwords.find((item) => sameWatchword(item, { keyword, targetPath }));
  if (!watchword) throw new Error(`Add the watchword before recording ${keyword} at ${targetPath}.`);
  if (!['gsc', 'serp'].includes(input.source)) throw new Error('source must be gsc or serp.');

  const startDate = dateOnly(input.startDate, 'startDate');
  const endDate = dateOnly(input.endDate, 'endDate');
  if (startDate > endDate) throw new Error('startDate must not be after endDate.');
  const observedAt = timestamp(input.observedAt ?? new Date().toISOString(), 'observedAt');
  const position = nullableNonNegative(input.position, 'position');
  const clicks = nullableNonNegative(input.clicks, 'clicks');
  const impressions = nullableNonNegative(input.impressions, 'impressions');
  if (clicks !== null && impressions !== null && clicks > impressions) {
    throw new Error('clicks must not exceed impressions.');
  }

  const country = text(input.country, 'country');
  const device = text(input.device, 'device');
  const searchType = text(input.searchType ?? 'web', 'searchType');
  const identity = JSON.stringify({
    observedAt, source: input.source, keyword, targetPath, position, clicks, impressions,
    startDate, endDate, country, device, searchType,
  });
  const observation: SeoRankObservation = {
    id: createHash('sha256').update(identity).digest('hex').slice(0, 16),
    observedAt,
    source: input.source,
    keyword,
    targetPath,
    position,
    clicks,
    impressions,
    window: { startDate, endDate },
    segment: {
      country,
      device,
      searchType,
    },
  };
  if (state.rankHistory.observations.some((item) => item.id === observation.id)) {
    throw new Error(`Rank observation ${observation.id} already exists; history was not changed.`);
  }
  state.rankHistory.observations.push(observation);
  await saveSeoWatch(repository, state);
  return observation;
}

function latestObservation(state: SeoWatchState, watchword: SeoWatchword): SeoRankObservation | null {
  return state.rankHistory.observations
    .filter((item) => sameWatchword(watchword, item))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0] ?? null;
}

function lastReviewOutcome(state: SeoWatchState, watchword: SeoWatchword): SeoReviewOutcome | null {
  const improvement = state.improvementLog.improvements.find((item) => sameWatchword(item, watchword));
  return improvement?.reviews.at(-1)?.outcome ?? null;
}

export function selectSeoCandidate(state: SeoWatchState): SeoCandidate | null {
  assertState(state);
  if (state.watchwords.watchwords.some((item) => item.status === 'observing')) return null;
  const candidates = state.watchwords.watchwords
    .filter((item) => item.status === 'active')
    .map((watchword, index) => ({
      watchword,
      index,
      observation: latestObservation(state, watchword),
      reviewOutcome: lastReviewOutcome(state, watchword),
    }));
  if (candidates.length === 0) return null;

  const ranked = candidates.map((candidate) => {
    const position = candidate.observation?.position;
    const impressions = candidate.observation?.impressions ?? 0;
    if (position !== null && position !== undefined && position >= 2 && position <= 10 && impressions > 0) {
      return { ...candidate, group: 0, reason: 'Observed in positions 2–10 with impressions; closest position wins.' };
    }
    if (position !== null && position !== undefined && position > 10 && position <= 20 && impressions > 0) {
      return { ...candidate, group: 1, reason: 'Observed in positions 11–20 with impressions; higher demand wins.' };
    }
    if (candidate.reviewOutcome && candidate.reviewOutcome !== 'achieved') {
      return { ...candidate, group: 2, reason: 'A reviewed experiment remains short of the goal; use a different change.' };
    }
    if ((position === null || position === undefined) && candidate.watchword.priority === 'high') {
      return { ...candidate, group: 3, reason: 'High-priority watchword has no observed position.' };
    }
    return { ...candidate, group: 4, reason: 'Active watchword selected by priority and stable file order.' };
  });

  ranked.sort((left, right) => {
    if (left.group !== right.group) return left.group - right.group;
    if (left.group === 0) return (left.observation?.position ?? Infinity) - (right.observation?.position ?? Infinity);
    if (left.group === 1) {
      const impressionDelta = (right.observation?.impressions ?? 0) - (left.observation?.impressions ?? 0);
      if (impressionDelta !== 0) return impressionDelta;
      return (left.observation?.position ?? Infinity) - (right.observation?.position ?? Infinity);
    }
    const priorityDelta = priorityWeight[left.watchword.priority] - priorityWeight[right.watchword.priority];
    return priorityDelta || left.index - right.index;
  });
  const selected = ranked[0];
  return { watchword: selected.watchword, latestObservation: selected.observation, reason: selected.reason };
}

export async function startSeoExperiment(repository: string, input: StartSeoExperimentInput): Promise<SeoImprovement> {
  const state = await loadSeoWatch(repository);
  const selected = selectSeoCandidate(state);
  if (!selected) {
    const observing = state.watchwords.watchwords.find((item) => item.status === 'observing');
    if (observing) throw new Error(`${observing.keyword} is observing until ${observing.nextReviewDate}; do not start another experiment.`);
    throw new Error('No active SEO watchword is available.');
  }
  if (normalizeKeyword(selected.watchword.keyword) !== normalizeKeyword(input.keyword)) {
    throw new Error(`Selected watchword is ${selected.watchword.keyword}; start that experiment or update the watchword priorities.`);
  }

  const date = dateOnly(input.date ?? todayUtc(), 'date');
  const nextReviewDate = dayAfter(date, 7);
  const watchword = state.watchwords.watchwords.find((item) => sameWatchword(item, selected.watchword))!;
  const improvement = state.improvementLog.improvements.find((item) => sameWatchword(item, selected.watchword))!;
  watchword.status = 'observing';
  watchword.nextReviewDate = nextReviewDate;
  improvement.status = 'observing';
  improvement.nextReviewDate = nextReviewDate;
  improvement.actions.push({
    date,
    baselineObservationId: selected.latestObservation?.id ?? null,
    searchIntent: text(input.searchIntent, 'searchIntent'),
    gap: text(input.gap, 'gap'),
    change: text(input.change, 'change'),
  });
  await saveSeoWatch(repository, state);
  return improvement;
}

export async function reviewSeoExperiment(repository: string, input: ReviewSeoExperimentInput): Promise<SeoImprovement> {
  const state = await loadSeoWatch(repository);
  const watchword = state.watchwords.watchwords.find((item) => normalizeKeyword(item.keyword) === normalizeKeyword(input.keyword));
  if (!watchword) throw new Error(`Unknown watchword: ${input.keyword}.`);
  if (watchword.status !== 'observing' || !watchword.nextReviewDate) {
    throw new Error(`${watchword.keyword} is not currently observing.`);
  }
  const date = dateOnly(input.date ?? todayUtc(), 'date');
  if (date < watchword.nextReviewDate) {
    throw new Error(`${watchword.keyword} remains in cooldown until ${watchword.nextReviewDate}.`);
  }
  if (!['achieved', 'improved', 'unchanged', 'declined'].includes(input.outcome)) {
    throw new Error('outcome must be achieved, improved, unchanged, or declined.');
  }
  const observation = state.rankHistory.observations.find((item) => item.id === input.observationId);
  if (!observation || !sameWatchword(watchword, observation)) {
    throw new Error('Review observation must exist and match the watchword and target path.');
  }
  const action = state.improvementLog.improvements.find((item) => sameWatchword(item, watchword))?.actions.at(-1);
  if (!action || observation.window.endDate <= action.date) {
    throw new Error('Review observation must cover a period ending after the latest action date.');
  }
  if (action.baselineObservationId) {
    const baseline = state.rankHistory.observations.find((item) => item.id === action.baselineObservationId);
    if (!baseline) throw new Error('The latest action references a missing baseline observation.');
    if (!sameSegment(baseline, observation)) {
      throw new Error('Review observation must use the same source, country, device, and search type as the baseline.');
    }
  }

  const status: SeoWatchStatus = input.outcome === 'achieved' ? 'achieved' : 'active';
  watchword.status = status;
  watchword.nextReviewDate = null;
  const improvement = state.improvementLog.improvements.find((item) => sameWatchword(item, watchword))!;
  improvement.status = status;
  improvement.nextReviewDate = null;
  improvement.reviews.push({
    date,
    outcome: input.outcome,
    observationId: observation.id,
    note: input.note?.trim() ?? '',
  });
  await saveSeoWatch(repository, state);
  return improvement;
}

export function summarizeSeoWatch(state: SeoWatchState) {
  assertState(state);
  const candidate = selectSeoCandidate(state);
  return {
    contractVersion: SEO_WATCH_CONTRACT_VERSION,
    counts: {
      active: state.watchwords.watchwords.filter((item) => item.status === 'active').length,
      observing: state.watchwords.watchwords.filter((item) => item.status === 'observing').length,
      achieved: state.watchwords.watchwords.filter((item) => item.status === 'achieved').length,
      observations: state.rankHistory.observations.length,
    },
    candidate,
    observing: state.watchwords.watchwords.filter((item) => item.status === 'observing'),
  };
}
