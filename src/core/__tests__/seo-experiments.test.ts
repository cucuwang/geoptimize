import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addSeoQuery,
  initializeSeoExperiments,
  loadSeoExperiments,
  recordSeoObservation,
  reviewSeoExperiment,
  selectSeoExperimentCandidate,
  startSeoExperiment,
} from '../seo-experiments.js';

const temporaryDirectories: string[] = [];

async function repository(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'geoptimize-seo-experiments-'));
  temporaryDirectories.push(directory);
  await initializeSeoExperiments(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SEO experiment ledger', () => {
  it('creates the three versioned data files without overwriting them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geoptimize-seo-experiments-'));
    temporaryDirectories.push(directory);
    await initializeSeoExperiments(directory);

    const queries = JSON.parse(await readFile(join(directory, 'data/seo/queries.json'), 'utf8'));
    const observations = JSON.parse(await readFile(join(directory, 'data/seo/observations.json'), 'utf8'));
    const experiments = JSON.parse(await readFile(join(directory, 'data/seo/experiments.json'), 'utf8'));
    expect(queries).toEqual({ contractVersion: '1.0', queries: [] });
    expect(observations).toEqual({ contractVersion: '1.0', observations: [] });
    expect(experiments).toEqual({ contractVersion: '1.0', experiments: [] });

    await writeFile(join(directory, 'data/seo/queries.json'), '{"owner":"keep"}\n');
    await expect(initializeSeoExperiments(directory)).rejects.toThrow('existing files were preserved');
    expect(await readFile(join(directory, 'data/seo/queries.json'), 'utf8')).toBe('{"owner":"keep"}\n');
  });

  it('records immutable segmented observations and rejects duplicates', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: '能源管理系統整合', targetPath: '/platform/', priority: 'high' });
    const input = {
      keyword: '能源管理系統整合', targetPath: '/platform/', source: 'gsc' as const,
      position: 7.2, clicks: 2, impressions: 41,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
      observedAt: '2026-08-29T02:00:00Z',
    };
    const observation = await recordSeoObservation(directory, input);
    await expect(recordSeoObservation(directory, input)).rejects.toThrow('history was not changed');
    const state = await loadSeoExperiments(directory);
    expect(state.observations.observations).toEqual([observation]);
    expect(observation.segment).toEqual({ country: 'TWN', device: 'DESKTOP', searchType: 'web' });
  });

  it('maps one exact query to only one target page', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'Energy Management', targetPath: '/one', priority: 'high' });
    await expect(addSeoQuery(directory, {
      keyword: '  energy   management ', targetPath: '/two', priority: 'high',
    })).rejects.toThrow('one exact query must map to one target page');
  });

  it('selects one candidate using position, impressions, and stable priorities', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'keyword near page one', targetPath: '/one', priority: 'medium' });
    await addSeoQuery(directory, { keyword: 'keyword with demand', targetPath: '/two', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'unknown high', targetPath: '/three', priority: 'high' });
    await recordSeoObservation(directory, {
      keyword: 'keyword near page one', targetPath: '/one', source: 'gsc', position: 8, impressions: 4, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP', observedAt: '2026-08-29T00:00:00Z',
    });
    await recordSeoObservation(directory, {
      keyword: 'keyword with demand', targetPath: '/two', source: 'gsc', position: 12, impressions: 500, clicks: 2,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP', observedAt: '2026-08-29T00:00:00Z',
    });
    const selected = selectSeoExperimentCandidate(await loadSeoExperiments(directory));
    expect(selected?.query.keyword).toBe('keyword near page one');
    expect(selected?.reason).toContain('2–10');
  });

  it('enforces one monitoring experiment and a seven-day cooldown', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'second', targetPath: '/second', priority: 'medium' });
    const first = await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Compare implementation options',
      gap: 'The page lacks a concrete scope.', change: 'Added an implementation scope and internal links.',
    });
    expect(first.status).toBe('monitoring');
    expect(first.nextReviewDate).toBe('2026-09-17');
    await expect(startSeoExperiment(directory, {
      keyword: 'second', date: '2026-09-10', searchIntent: 'Find a supplier', gap: 'Missing detail', change: 'Added detail',
    })).rejects.toThrow('monitoring until 2026-09-17');
  });

  it('requires a matching post-action observation before review', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Understand the service',
      gap: 'Missing inputs and outputs.', change: 'Added visible inputs and outputs.',
    });
    const observation = await recordSeoObservation(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 4.3, impressions: 20, clicks: 1,
      startDate: '2026-09-11', endDate: '2026-09-17', country: 'TWN', device: 'DESKTOP', observedAt: '2026-09-18T00:00:00Z',
    });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'improved', observationId: observation.id, date: '2026-09-16',
    })).rejects.toThrow('cooldown until 2026-09-17');
    const reviewed = await reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'improved', observationId: observation.id, date: '2026-09-17', note: 'Position improved.',
    });
    expect(reviewed.status).toBe('eligible');
    expect(reviewed.nextReviewDate).toBeNull();
    expect(reviewed.reviews).toHaveLength(1);
  });

  it('completes a query only when its goal is met', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Understand the service',
      gap: 'Missing inputs and outputs.', change: 'Added visible inputs and outputs.',
    });
    const observation = await recordSeoObservation(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 1, impressions: 30, clicks: 3,
      startDate: '2026-09-11', endDate: '2026-09-17', country: 'TWN', device: 'DESKTOP', observedAt: '2026-09-18T00:00:00Z',
    });
    const reviewed = await reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'goal_met', observationId: observation.id, date: '2026-09-17',
    });
    expect(reviewed.status).toBe('completed');
    expect(selectSeoExperimentCandidate(await loadSeoExperiments(directory))).toBeNull();
  });

  it('rejects a review that changes the measured segment', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await recordSeoObservation(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 6, impressions: 20, clicks: 1,
      startDate: '2026-08-13', endDate: '2026-09-09', country: 'TWN', device: 'DESKTOP', observedAt: '2026-09-10T00:00:00Z',
    });
    await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Understand the service',
      gap: 'Missing inputs and outputs.', change: 'Added visible inputs and outputs.',
    });
    const mobile = await recordSeoObservation(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 4, impressions: 30, clicks: 2,
      startDate: '2026-09-11', endDate: '2026-09-17', country: 'TWN', device: 'MOBILE', observedAt: '2026-09-18T00:00:00Z',
    });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'improved', observationId: mobile.id, date: '2026-09-17',
    })).rejects.toThrow('same source, country, device, and search type');
  });
});
