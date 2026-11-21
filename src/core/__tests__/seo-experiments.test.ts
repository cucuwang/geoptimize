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

  it('rejects calendar dates that do not exist', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'kw', targetPath: '/p' });
    await expect(recordSeoObservation(directory, {
      keyword: 'kw', targetPath: '/p', source: 'gsc',
      startDate: '2026-02-30', endDate: '2026-03-01', country: 'TWN', device: 'DESKTOP',
    })).rejects.toThrow('YYYY-MM-DD');
    await expect(recordSeoObservation(directory, {
      keyword: 'kw', targetPath: '/p', source: 'gsc',
      startDate: '2026-08-01', endDate: '2026-08-31', country: 'TWN', device: 'DESKTOP',
    })).resolves.toBeTruthy();
    await expect(startSeoExperiment(directory, {
      keyword: 'kw', date: '2026-11-31', searchIntent: 'i', gap: 'g', change: 'c',
    })).rejects.toThrow('YYYY-MM-DD');
  });

  it('validates observation windows, metrics and query registration', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'kw', targetPath: '/p' });
    const base = {
      keyword: 'kw', targetPath: '/p', source: 'gsc' as const,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
    };
    await expect(recordSeoObservation(directory, { ...base, startDate: '2026-08-29' }))
      .rejects.toThrow('startDate must not be after endDate');
    await expect(recordSeoObservation(directory, { ...base, clicks: 10, impressions: 5 }))
      .rejects.toThrow('clicks must not exceed impressions');
    await expect(recordSeoObservation(directory, { ...base, position: -1 }))
      .rejects.toThrow('non-negative');
    await expect(recordSeoObservation(directory, { ...base, impressions: -3 }))
      .rejects.toThrow('non-negative');
    await expect(recordSeoObservation(directory, { ...base, source: 'other' as never }))
      .rejects.toThrow('source must be gsc or serp');
    await expect(recordSeoObservation(directory, { ...base, keyword: 'not-registered' }))
      .rejects.toThrow('Add the query before recording');
  });

  it('rejects invalid dates at the observation timestamp boundary', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'kw', targetPath: '/p' });
    await expect(recordSeoObservation(directory, {
      keyword: 'kw', targetPath: '/p', source: 'gsc',
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
      observedAt: 'not-a-date',
    })).rejects.toThrow('ISO timestamp');
  });

  it('names the selected candidate when starting the wrong keyword', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'chosen', targetPath: '/a', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'other', targetPath: '/b', priority: 'low' });
    await expect(startSeoExperiment(directory, {
      keyword: 'other', searchIntent: 'i', gap: 'g', change: 'c',
    })).rejects.toThrow('Selected query is chosen');
  });

  it('prefers higher impressions among positions 11-20', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'low demand', targetPath: '/a', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'high demand', targetPath: '/b', priority: 'low' });
    for (const [keyword, targetPath, position, impressions] of [
      ['low demand', '/a', 15, 10],
      ['high demand', '/b', 18, 900],
    ] as const) {
      await recordSeoObservation(directory, {
        keyword, targetPath, source: 'gsc', position, impressions, clicks: 1,
        startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
      });
    }
    const selected = selectSeoExperimentCandidate(await loadSeoExperiments(directory));
    expect(selected?.query.keyword).toBe('high demand');
    expect(selected?.reason).toContain('11–20');
  });

  it('prefers a reviewed-but-unfinished experiment over untouched queries', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'reviewed', targetPath: '/a', priority: 'low' });
    await addSeoQuery(directory, { keyword: 'untouched', targetPath: '/b', priority: 'high' });
    const baseline = await recordSeoObservation(directory, {
      keyword: 'reviewed', targetPath: '/a', source: 'gsc', position: 6, impressions: 5, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
      observedAt: '2026-08-29T00:00:00Z',
    });
    await startSeoExperiment(directory, {
      keyword: 'reviewed', date: '2026-09-01', searchIntent: 'i', gap: 'g', change: 'c',
    });
    const followup = await recordSeoObservation(directory, {
      keyword: 'reviewed', targetPath: '/a', source: 'gsc', position: 30, impressions: 5, clicks: 0,
      startDate: '2026-09-02', endDate: '2026-09-08', country: 'TWN', device: 'DESKTOP',
      observedAt: '2026-09-09T00:00:00Z',
    });
    await reviewSeoExperiment(directory, {
      keyword: 'reviewed', outcome: 'unchanged', observationId: followup.id, date: '2026-09-08',
    });
    const selected = selectSeoExperimentCandidate(await loadSeoExperiments(directory));
    expect(selected?.query.keyword).toBe('reviewed');
    expect(selected?.reason).toContain('short of the goal');
    expect(selected?.latestObservation?.id).toBe(followup.id);
    expect(baseline.id).not.toBe(followup.id);
  });

  it('prefers high-priority queries without observations over low-priority ones', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'low prio', targetPath: '/a', priority: 'low' });
    await addSeoQuery(directory, { keyword: 'high prio', targetPath: '/b', priority: 'high' });
    const selected = selectSeoExperimentCandidate(await loadSeoExperiments(directory));
    expect(selected?.query.keyword).toBe('high prio');
    expect(selected?.reason).toContain('no observed position');
  });

  it('returns null when no queries are registered', async () => {
    const directory = await repository();
    expect(selectSeoExperimentCandidate(await loadSeoExperiments(directory))).toBeNull();
  });

  it('enforces review preconditions in order', async () => {
    const directory = await repository();
    await expect(reviewSeoExperiment(directory, { keyword: 'ghost', outcome: 'improved', observationId: 'x' }))
      .rejects.toThrow('Unknown query');
    await addSeoQuery(directory, { keyword: 'kw', targetPath: '/p' });
    await expect(reviewSeoExperiment(directory, { keyword: 'kw', outcome: 'improved', observationId: 'x' }))
      .rejects.toThrow('not currently monitoring');
    await startSeoExperiment(directory, {
      keyword: 'kw', date: '2026-09-10', searchIntent: 'i', gap: 'g', change: 'c',
    });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'kw', outcome: 'bogus' as never, observationId: 'x', date: '2026-09-17',
    })).rejects.toThrow('must be goal_met, improved, unchanged, or declined');
    await expect(reviewSeoExperiment(directory, {
      keyword: 'kw', outcome: 'improved', observationId: 'missing', date: '2026-09-17',
    })).rejects.toThrow('must exist and match');
  });

  it('rejects review observations whose window ends on or before the action date', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'kw', targetPath: '/p' });
    await startSeoExperiment(directory, {
      keyword: 'kw', date: '2026-09-10', searchIntent: 'i', gap: 'g', change: 'c',
    });
    const observation = await recordSeoObservation(directory, {
      keyword: 'kw', targetPath: '/p', source: 'gsc', position: 20, impressions: 9, clicks: 0,
      startDate: '2026-09-01', endDate: '2026-09-10', country: 'TWN', device: 'DESKTOP',
      observedAt: '2026-09-11T00:00:00Z',
    });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'kw', outcome: 'improved', observationId: observation.id, date: '2026-09-17',
    })).rejects.toThrow('ending after the latest action date');
  });

  it('makes a declined experiment eligible again after review', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'kw', targetPath: '/p' });
    await startSeoExperiment(directory, {
      keyword: 'kw', date: '2026-09-10', searchIntent: 'i', gap: 'g', change: 'c',
    });
    const observation = await recordSeoObservation(directory, {
      keyword: 'kw', targetPath: '/p', source: 'gsc', position: 30, impressions: 9, clicks: 0,
      startDate: '2026-09-11', endDate: '2026-09-17', country: 'TWN', device: 'DESKTOP',
    });
    const reviewed = await reviewSeoExperiment(directory, {
      keyword: 'kw', outcome: 'declined', observationId: observation.id, date: '2026-09-17',
    });
    expect(reviewed.status).toBe('eligible');
    expect(reviewed.reviews[0].outcome).toBe('declined');
    const state = await loadSeoExperiments(directory);
    expect(selectSeoExperimentCandidate(state)?.query.keyword).toBe('kw');
  });

  it('summarizes counts, monitoring queries and the next candidate', async () => {
    const directory = await repository();
    await addSeoQuery(directory, { keyword: 'monitored', targetPath: '/a', priority: 'high' });
    await addSeoQuery(directory, { keyword: 'waiting', targetPath: '/b', priority: 'medium' });
    await recordSeoObservation(directory, {
      keyword: 'waiting', targetPath: '/b', source: 'gsc', position: 30, impressions: 20, clicks: 1,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
    });
    await startSeoExperiment(directory, {
      keyword: 'monitored', date: '2026-09-10', searchIntent: 'i', gap: 'g', change: 'c',
    });
    const summary = summarizeSeoExperiments(await loadSeoExperiments(directory));
    expect(summary.contractVersion).toBe('1.0');
    expect(summary.counts).toEqual({ eligible: 1, monitoring: 1, completed: 0, observations: 1 });
    expect(summary.monitoring.map((q) => q.keyword)).toEqual(['monitored']);
    expect(summary.candidate).toBeNull();
  });

  it('rejects data files with the wrong contract version', async () => {
    const directory = await repository();
    await writeFile(
      join(directory, 'data/seo/queries.json'),
      JSON.stringify({ contractVersion: '0.9', queries: [] }),
    );
    await expect(loadSeoExperiments(directory)).rejects.toThrow('contractVersion');
    expect(() => selectSeoExperimentCandidate({
      queries: { contractVersion: '2.0', queries: [] },
      observations: { contractVersion: '1.0', observations: [] },
      experiments: { contractVersion: '1.0', experiments: [] },
    } as never)).toThrow('contractVersion');
  });
});
