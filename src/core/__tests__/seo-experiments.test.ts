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
  summarizeSeoExperiments,
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

  it('rejects nonexistent calendar dates instead of normalizing them', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    // Date.parse normalizes 2026-02-30 to March 2; the ledger must not accept it.
    await expect(recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'gsc', position: 5, impressions: 10, clicks: 0,
      startDate: '2026-02-30', endDate: '2026-03-05', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('YYYY-MM-DD');
  });

  it('accepts a real leap day but rejects February 29 in a non-leap year', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    const leap = await recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'gsc', position: 5, impressions: 10, clicks: 0,
      startDate: '2024-02-29', endDate: '2024-03-05', country: 'TWN', device: 'DESKTOP',
    });
    expect(leap.window.startDate).toBe('2024-02-29');
    await expect(recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'gsc', position: 5, impressions: 10, clicks: 0,
      startDate: '2026-02-29', endDate: '2026-03-05', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('YYYY-MM-DD');
  });

  it('rejects a nonexistent experiment start date', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    await expect(startSeoExperiment(directory, {
      keyword: 'k', date: '2026-04-31', searchIntent: 's', gap: 'g', change: 'c',
    })).rejects.toThrow('YYYY-MM-DD');
  });

  it('rejects a start date that is not YYYY-MM-DD shaped', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    await expect(startSeoExperiment(directory, {
      keyword: 'k', date: '10/05/2026', searchIntent: 's', gap: 'g', change: 'c',
    })).rejects.toThrow('YYYY-MM-DD');
  });

  it('rejects observations for queries that were never added', async () => {
    const directory = await repository();
    await expect(recordSeoObservation(directory, {
      keyword: 'ghost', targetPath: '/ghost', source: 'gsc', position: 5, impressions: 10, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('Add the query before recording');
  });

  it('rejects observations whose clicks exceed impressions', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    await expect(recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'gsc', position: 5, impressions: 10, clicks: 11,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('clicks must not exceed impressions');
  });

  it('rejects negative metric values and reversed windows', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    await expect(recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'gsc', position: -1, impressions: 10, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('non-negative');
    await expect(recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'gsc', position: 5, impressions: 10, clicks: 0,
      startDate: '2026-08-28', endDate: '2026-08-01', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('must not be after endDate');
  });

  it('rejects observation sources outside the contract enum', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    await expect(recordSeoObservation(directory, {
      keyword: 'k', targetPath: '/k', source: 'analytics' as 'gsc', position: 5, impressions: 10, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('gsc or serp');
  });

  it('rejects queries with invalid priority or empty keyword', async () => {
    const directory = await repository();
    await expect(addSeoQuery(directory, {
      keyword: 'k', targetPath: '/k', priority: 'urgent' as 'high',
    })).rejects.toThrow('high, medium, or low');
    await expect(addSeoQuery(directory, { keyword: '   ', targetPath: '/k' }))
      .rejects.toThrow('must not be empty');
  });

  it('defaults new queries to medium priority', async () => {
    const directory = await repository();
    const query = await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    expect(query.priority).toBe('medium');
    expect(query.status).toBe('eligible');
    expect(query.nextReviewDate).toBeNull();
  });

  it('refuses to load a state whose contract version changed', async () => {
    const directory = await repository();
    await writeFile(join(directory, 'data/seo/queries.json'), '{"contractVersion":"9.9","queries":[]}\n');
    await expect(loadSeoExperiments(directory)).rejects.toThrow('contractVersion must be 1.0');
  });

  it('selects no candidate while another query is monitoring', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'second', targetPath: '/second', priority: 'high' });
    await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 's', gap: 'g', change: 'c',
    });
    expect(selectSeoExperimentCandidate(await loadSeoExperiments(directory))).toBeNull();
  });

  it('prefers the higher-impressions candidate inside positions 11-20', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'low demand', targetPath: '/low', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'high demand', targetPath: '/high', priority: 'low' });
    await recordSeoObservation(directory, {
      keyword: 'low demand', targetPath: '/low', source: 'gsc', position: 12, impressions: 30, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP', observedAt: '2026-08-29T00:00:00Z',
    });
    await recordSeoObservation(directory, {
      keyword: 'high demand', targetPath: '/high', source: 'gsc', position: 15, impressions: 900, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP', observedAt: '2026-08-29T00:00:00Z',
    });
    const selected = selectSeoExperimentCandidate(await loadSeoExperiments(directory));
    expect(selected?.query.keyword).toBe('high demand');
    expect(selected?.reason).toContain('11–20');
  });

  it('refuses to start an experiment for a keyword that was not selected', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'chosen', targetPath: '/chosen', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'other', targetPath: '/other', priority: 'low' });
    await expect(startSeoExperiment(directory, {
      keyword: 'other', date: '2026-09-10', searchIntent: 's', gap: 'g', change: 'c',
    })).rejects.toThrow('Selected query is chosen');
  });

  it('rejects reviews for unknown or non-monitoring queries', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k' });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'ghost', outcome: 'improved', observationId: 'x', date: '2026-09-17',
    })).rejects.toThrow('Unknown query');
    await expect(reviewSeoExperiment(directory, {
      keyword: 'k', outcome: 'amazing' as 'improved', observationId: 'x', date: '2026-09-17',
    })).rejects.toThrow('not currently monitoring');
  });

  it('summarizes counts and surfaces the selected candidate', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'k', targetPath: '/k', priority: 'high' });
    const summary = summarizeSeoExperiments(await loadSeoExperiments(directory));
    expect(summary.contractVersion).toBe('1.0');
    expect(summary.counts).toEqual({ eligible: 1, monitoring: 0, completed: 0, observations: 0 });
    expect(summary.candidate?.query.keyword).toBe('k');
  });
});
