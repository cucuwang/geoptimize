import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const SEO_EXPERIMENT_CONTRACT_VERSION = '1.0' as const;
export const SEO_EXPERIMENT_DIRECTORY = join('data', 'seo');
export const SEO_EXPERIMENT_FILES = {
  queries: 'queries.json',
  observations: 'observations.json',
  experiments: 'experiments.json',
} as const;

export type SeoPriority = 'high' | 'medium' | 'low';
export type SeoExperimentStatus = 'eligible' | 'monitoring' | 'completed';
export type SeoObservationSource = 'gsc' | 'serp';
export type SeoReviewOutcome = 'goal_met' | 'improved' | 'unchanged' | 'declined';

export interface SeoQuery {
  keyword: string;
  targetPath: string;
  priority: SeoPriority;
  status: SeoExperimentStatus;
  nextReviewDate: string | null;
}

export interface SeoQueriesFile {
  contractVersion: typeof SEO_EXPERIMENT_CONTRACT_VERSION;
  queries: SeoQuery[];
}

export interface SeoObservation {
  id: string;
  observedAt: string;
  source: SeoObservationSource;
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

export interface SeoObservationsFile {
  contractVersion: typeof SEO_EXPERIMENT_CONTRACT_VERSION;
  observations: SeoObservation[];
}

export interface SeoExperimentAction {
  date: string;
  baselineObservationId: string | null;
  searchIntent: string;
  gap: string;
  change: string;
}

export interface SeoExperimentReview {
  date: string;
  outcome: SeoReviewOutcome;
  observationId: string;
  note: string;
}

export interface SeoExperiment {
  keyword: string;
  targetPath: string;
  status: SeoExperimentStatus;
  nextReviewDate: string | null;
  actions: SeoExperimentAction[];
  reviews: SeoExperimentReview[];
}

export interface SeoExperimentsFile {
  contractVersion: typeof SEO_EXPERIMENT_CONTRACT_VERSION;
  experiments: SeoExperiment[];
}

export interface SeoExperimentState {
  queries: SeoQueriesFile;
  observations: SeoObservationsFile;
  experiments: SeoExperimentsFile;
}

export interface SeoExperimentCandidate {
  query: SeoQuery;
  latestObservation: SeoObservation | null;
  reason: string;
}

export interface RecordSeoObservationInput {
  keyword: string;
  targetPath: string;
  source: SeoObservationSource;
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

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sameQuery(left: Pick<SeoQuery, 'keyword' | 'targetPath'>, right: Pick<SeoQuery, 'keyword' | 'targetPath'>): boolean {
  return normalizeQuery(left.keyword) === normalizeQuery(right.keyword) && left.targetPath === right.targetPath;
}

function sameSegment(left: SeoObservation, right: SeoObservation): boolean {
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

function emptyState(): SeoExperimentState {
  return {
    queries: { contractVersion: SEO_EXPERIMENT_CONTRACT_VERSION, queries: [] },
    observations: { contractVersion: SEO_EXPERIMENT_CONTRACT_VERSION, observations: [] },
    experiments: { contractVersion: SEO_EXPERIMENT_CONTRACT_VERSION, experiments: [] },
  };
}

function paths(repository: string) {
  const directory = join(repository, SEO_EXPERIMENT_DIRECTORY);
  return {
    directory,
    queries: join(directory, SEO_EXPERIMENT_FILES.queries),
    observations: join(directory, SEO_EXPERIMENT_FILES.observations),
    experiments: join(directory, SEO_EXPERIMENT_FILES.experiments),
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
  if (value !== SEO_EXPERIMENT_CONTRACT_VERSION) {
    throw new Error(`${label} contractVersion must be ${SEO_EXPERIMENT_CONTRACT_VERSION}.`);
  }
}

function assertState(state: SeoExperimentState): void {
  assertVersion(state.queries.contractVersion, SEO_EXPERIMENT_FILES.queries);
  assertVersion(state.observations.contractVersion, SEO_EXPERIMENT_FILES.observations);
  assertVersion(state.experiments.contractVersion, SEO_EXPERIMENT_FILES.experiments);
  if (!Array.isArray(state.queries.queries)) throw new Error('queries must be an array.');
  if (!Array.isArray(state.observations.observations)) throw new Error('observations must be an array.');
  if (!Array.isArray(state.experiments.experiments)) throw new Error('experiments must be an array.');
}

export async function initializeSeoExperiments(repository: string): Promise<SeoExperimentState> {
  await assertRepository(repository);
  const target = paths(repository);
  const existing = await Promise.all([
    exists(target.queries),
    exists(target.observations),
    exists(target.experiments),
  ]);
  if (existing.some(Boolean)) {
    throw new Error(`SEO experiment data already exists in ${target.directory}; existing files were preserved.`);
  }

  await mkdir(target.directory, { recursive: true });
  const state = emptyState();
  await writeFile(target.queries, `${JSON.stringify(state.queries, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(target.observations, `${JSON.stringify(state.observations, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(target.experiments, `${JSON.stringify(state.experiments, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return state;
}

export async function loadSeoExperiments(repository: string): Promise<SeoExperimentState> {
  await assertRepository(repository);
  const target = paths(repository);
  const [queries, observations, experiments] = await Promise.all([
    readFile(target.queries, 'utf8').then(JSON.parse) as Promise<SeoQueriesFile>,
    readFile(target.observations, 'utf8').then(JSON.parse) as Promise<SeoObservationsFile>,
    readFile(target.experiments, 'utf8').then(JSON.parse) as Promise<SeoExperimentsFile>,
  ]);
  const state = { queries, observations, experiments };
  assertState(state);
  return state;
}

async function saveSeoExperiments(repository: string, state: SeoExperimentState): Promise<void> {
  assertState(state);
  const target = paths(repository);
  await atomicJson(target.queries, state.queries);
  await atomicJson(target.observations, state.observations);
  await atomicJson(target.experiments, state.experiments);
}

export async function addSeoQuery(
  repository: string,
  input: { keyword: string; targetPath: string; priority?: SeoPriority },
): Promise<SeoQuery> {
  const state = await loadSeoExperiments(repository);
  const query: SeoQuery = {
    keyword: text(input.keyword, 'keyword'),
    targetPath: text(input.targetPath, 'targetPath'),
    priority: input.priority ?? 'medium',
    status: 'eligible',
    nextReviewDate: null,
  };
  if (!['high', 'medium', 'low'].includes(query.priority)) throw new Error('priority must be high, medium, or low.');
  if (state.queries.queries.some((item) => normalizeQuery(item.keyword) === normalizeQuery(query.keyword))) {
    throw new Error(`Query already exists for ${query.keyword}; one exact query must map to one target page.`);
  }
  state.queries.queries.push(query);
  state.experiments.experiments.push({
    keyword: query.keyword,
    targetPath: query.targetPath,
    status: 'eligible',
    nextReviewDate: null,
    actions: [],
    reviews: [],
  });
  await saveSeoExperiments(repository, state);
  return query;
}

export async function recordSeoObservation(repository: string, input: RecordSeoObservationInput): Promise<SeoObservation> {
  const state = await loadSeoExperiments(repository);
  const keyword = text(input.keyword, 'keyword');
  const targetPath = text(input.targetPath, 'targetPath');
  const query = state.queries.queries.find((item) => sameQuery(item, { keyword, targetPath }));
  if (!query) throw new Error(`Add the query before recording ${keyword} at ${targetPath}.`);
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
  const observation: SeoObservation = {
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
  if (state.observations.observations.some((item) => item.id === observation.id)) {
    throw new Error(`Observation ${observation.id} already exists; history was not changed.`);
  }
  state.observations.observations.push(observation);
  await saveSeoExperiments(repository, state);
  return observation;
}

function latestObservation(state: SeoExperimentState, query: SeoQuery): SeoObservation | null {
  return state.observations.observations
    .filter((item) => sameQuery(query, item))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0] ?? null;
}

function lastReviewOutcome(state: SeoExperimentState, query: SeoQuery): SeoReviewOutcome | null {
  const experiment = state.experiments.experiments.find((item) => sameQuery(item, query));
  return experiment?.reviews.at(-1)?.outcome ?? null;
}

export function selectSeoExperimentCandidate(state: SeoExperimentState): SeoExperimentCandidate | null {
  assertState(state);
  if (state.queries.queries.some((item) => item.status === 'monitoring')) return null;
  const candidates = state.queries.queries
    .filter((item) => item.status === 'eligible')
    .map((query, index) => ({
      query,
      index,
      observation: latestObservation(state, query),
      reviewOutcome: lastReviewOutcome(state, query),
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
    if (candidate.reviewOutcome && candidate.reviewOutcome !== 'goal_met') {
      return { ...candidate, group: 2, reason: 'A reviewed experiment remains short of the goal; use a different change.' };
    }
    if ((position === null || position === undefined) && candidate.query.priority === 'high') {
      return { ...candidate, group: 3, reason: 'High-priority query has no observed position.' };
    }
    return { ...candidate, group: 4, reason: 'Eligible query selected by priority and stable file order.' };
  });

  ranked.sort((left, right) => {
    if (left.group !== right.group) return left.group - right.group;
    if (left.group === 0) return (left.observation?.position ?? Infinity) - (right.observation?.position ?? Infinity);
    if (left.group === 1) {
      const impressionDelta = (right.observation?.impressions ?? 0) - (left.observation?.impressions ?? 0);
      if (impressionDelta !== 0) return impressionDelta;
      return (left.observation?.position ?? Infinity) - (right.observation?.position ?? Infinity);
    }
    const priorityDelta = priorityWeight[left.query.priority] - priorityWeight[right.query.priority];
    return priorityDelta || left.index - right.index;
  });
  const selected = ranked[0];
  return { query: selected.query, latestObservation: selected.observation, reason: selected.reason };
}

export async function startSeoExperiment(repository: string, input: StartSeoExperimentInput): Promise<SeoExperiment> {
  const state = await loadSeoExperiments(repository);
  const selected = selectSeoExperimentCandidate(state);
  if (!selected) {
    const monitoring = state.queries.queries.find((item) => item.status === 'monitoring');
    if (monitoring) throw new Error(`${monitoring.keyword} is monitoring until ${monitoring.nextReviewDate}; do not start another experiment.`);
    throw new Error('No eligible SEO query is available.');
  }
  if (normalizeQuery(selected.query.keyword) !== normalizeQuery(input.keyword)) {
    throw new Error(`Selected query is ${selected.query.keyword}; start that experiment or update the query priorities.`);
  }

  const date = dateOnly(input.date ?? todayUtc(), 'date');
  const nextReviewDate = dayAfter(date, 7);
  const query = state.queries.queries.find((item) => sameQuery(item, selected.query))!;
  const experiment = state.experiments.experiments.find((item) => sameQuery(item, selected.query))!;
  query.status = 'monitoring';
  query.nextReviewDate = nextReviewDate;
  experiment.status = 'monitoring';
  experiment.nextReviewDate = nextReviewDate;
  experiment.actions.push({
    date,
    baselineObservationId: selected.latestObservation?.id ?? null,
    searchIntent: text(input.searchIntent, 'searchIntent'),
    gap: text(input.gap, 'gap'),
    change: text(input.change, 'change'),
  });
  await saveSeoExperiments(repository, state);
  return experiment;
}

export async function reviewSeoExperiment(repository: string, input: ReviewSeoExperimentInput): Promise<SeoExperiment> {
  const state = await loadSeoExperiments(repository);
  const query = state.queries.queries.find((item) => normalizeQuery(item.keyword) === normalizeQuery(input.keyword));
  if (!query) throw new Error(`Unknown query: ${input.keyword}.`);
  if (query.status !== 'monitoring' || !query.nextReviewDate) {
    throw new Error(`${query.keyword} is not currently monitoring.`);
  }
  const date = dateOnly(input.date ?? todayUtc(), 'date');
  if (date < query.nextReviewDate) {
    throw new Error(`${query.keyword} remains in cooldown until ${query.nextReviewDate}.`);
  }
  if (!['goal_met', 'improved', 'unchanged', 'declined'].includes(input.outcome)) {
    throw new Error('outcome must be goal_met, improved, unchanged, or declined.');
  }
  const observation = state.observations.observations.find((item) => item.id === input.observationId);
  if (!observation || !sameQuery(query, observation)) {
    throw new Error('Review observation must exist and match the query and target path.');
  }
  const action = state.experiments.experiments.find((item) => sameQuery(item, query))?.actions.at(-1);
  if (!action || observation.window.endDate <= action.date) {
    throw new Error('Review observation must cover a period ending after the latest action date.');
  }
  if (action.baselineObservationId) {
    const baseline = state.observations.observations.find((item) => item.id === action.baselineObservationId);
    if (!baseline) throw new Error('The latest action references a missing baseline observation.');
    if (!sameSegment(baseline, observation)) {
      throw new Error('Review observation must use the same source, country, device, and search type as the baseline.');
    }
  }

  const status: SeoExperimentStatus = input.outcome === 'goal_met' ? 'completed' : 'eligible';
  query.status = status;
  query.nextReviewDate = null;
  const experiment = state.experiments.experiments.find((item) => sameQuery(item, query))!;
  experiment.status = status;
  experiment.nextReviewDate = null;
  experiment.reviews.push({
    date,
    outcome: input.outcome,
    observationId: observation.id,
    note: input.note?.trim() ?? '',
  });
  await saveSeoExperiments(repository, state);
  return experiment;
}

export function summarizeSeoExperiments(state: SeoExperimentState) {
  assertState(state);
  const candidate = selectSeoExperimentCandidate(state);
  return {
    contractVersion: SEO_EXPERIMENT_CONTRACT_VERSION,
    counts: {
      eligible: state.queries.queries.filter((item) => item.status === 'eligible').length,
      monitoring: state.queries.queries.filter((item) => item.status === 'monitoring').length,
      completed: state.queries.queries.filter((item) => item.status === 'completed').length,
      observations: state.observations.observations.length,
    },
    candidate,
    monitoring: state.queries.queries.filter((item) => item.status === 'monitoring'),
  };
}
