import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addSeoWatchword,
  initializeSeoWatch,
  loadSeoWatch,
  recordSeoRank,
  reviewSeoExperiment,
  selectSeoCandidate,
  startSeoExperiment,
} from '../seo-watch.js';

const temporaryDirectories: string[] = [];

async function repository(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'geoptimize-seo-watch-'));
  temporaryDirectories.push(directory);
  await initializeSeoWatch(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SEO watch state', () => {
  it('creates the three versioned data files without overwriting them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geoptimize-seo-watch-'));
    temporaryDirectories.push(directory);
    await initializeSeoWatch(directory);

    const watchwords = JSON.parse(await readFile(join(directory, 'data/seo/watchwords.json'), 'utf8'));
    const history = JSON.parse(await readFile(join(directory, 'data/seo/rank-history.json'), 'utf8'));
    const log = JSON.parse(await readFile(join(directory, 'data/seo/improvement-log.json'), 'utf8'));
    expect(watchwords).toEqual({ contractVersion: '1.0', watchwords: [] });
    expect(history).toEqual({ contractVersion: '1.0', observations: [] });
    expect(log).toEqual({ contractVersion: '1.0', improvements: [] });

    await writeFile(join(directory, 'data/seo/watchwords.json'), '{"owner":"keep"}\n');
    await expect(initializeSeoWatch(directory)).rejects.toThrow('existing files were preserved');
    expect(await readFile(join(directory, 'data/seo/watchwords.json'), 'utf8')).toBe('{"owner":"keep"}\n');
  });

  it('records immutable segmented observations and rejects duplicates', async () => {
    const directory = await repository();
    await addSeoWatchword(directory, { keyword: '能源管理系統整合', targetPath: '/platform/', priority: 'high' });
    const input = {
      keyword: '能源管理系統整合', targetPath: '/platform/', source: 'gsc' as const,
      position: 7.2, clicks: 2, impressions: 41,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP',
      observedAt: '2026-08-29T02:00:00Z',
    };
    const observation = await recordSeoRank(directory, input);
    await expect(recordSeoRank(directory, input)).rejects.toThrow('history was not changed');
    const state = await loadSeoWatch(directory);
    expect(state.rankHistory.observations).toEqual([observation]);
    expect(observation.segment).toEqual({ country: 'TWN', device: 'DESKTOP', searchType: 'web' });
  });

  it('maps one exact query to only one target page', async () => {
    const directory = await repository();
    await addSeoWatchword(directory, { keyword: 'Energy Management', targetPath: '/one', priority: 'high' });
    await expect(addSeoWatchword(directory, {
      keyword: '  energy   management ', targetPath: '/two', priority: 'high',
    })).rejects.toThrow('one exact query must map to one target page');
  });

  it('selects one candidate using position, impressions, and stable priorities', async () => {
    const directory = await repository();
    await addSeoWatchword(directory, { keyword: 'keyword near page one', targetPath: '/one', priority: 'medium' });
    await addSeoWatchword(directory, { keyword: 'keyword with demand', targetPath: '/two', priority: 'high' });
    await addSeoWatchword(directory, { keyword: 'unknown high', targetPath: '/three', priority: 'high' });
    await recordSeoRank(directory, {
      keyword: 'keyword near page one', targetPath: '/one', source: 'gsc', position: 8, impressions: 4, clicks: 0,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP', observedAt: '2026-08-29T00:00:00Z',
    });
    await recordSeoRank(directory, {
      keyword: 'keyword with demand', targetPath: '/two', source: 'gsc', position: 12, impressions: 500, clicks: 2,
      startDate: '2026-08-01', endDate: '2026-08-28', country: 'TWN', device: 'DESKTOP', observedAt: '2026-08-29T00:00:00Z',
    });
    const selected = selectSeoCandidate(await loadSeoWatch(directory));
    expect(selected?.watchword.keyword).toBe('keyword near page one');
    expect(selected?.reason).toContain('2–10');
  });

  it('enforces one active experiment and a seven-day cooldown', async () => {
    const directory = await repository();
    await addSeoWatchword(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await addSeoWatchword(directory, { keyword: 'second', targetPath: '/second', priority: 'medium' });
    const first = await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Compare implementation options',
      gap: 'The page lacks a concrete scope.', change: 'Added an implementation scope and internal links.',
    });
    expect(first.status).toBe('observing');
    expect(first.nextReviewDate).toBe('2026-09-17');
    await expect(startSeoExperiment(directory, {
      keyword: 'second', date: '2026-09-10', searchIntent: 'Find a supplier', gap: 'Missing detail', change: 'Added detail',
    })).rejects.toThrow('observing until 2026-09-17');
  });

  it('requires a matching post-action observation before review', async () => {
    const directory = await repository();
    await addSeoWatchword(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Understand the service',
      gap: 'Missing inputs and outputs.', change: 'Added visible inputs and outputs.',
    });
    const observation = await recordSeoRank(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 4.3, impressions: 20, clicks: 1,
      startDate: '2026-09-11', endDate: '2026-09-17', country: 'TWN', device: 'DESKTOP', observedAt: '2026-09-18T00:00:00Z',
    });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'improved', observationId: observation.id, date: '2026-09-16',
    })).rejects.toThrow('cooldown until 2026-09-17');
    const reviewed = await reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'improved', observationId: observation.id, date: '2026-09-17', note: 'Position improved.',
    });
    expect(reviewed.status).toBe('active');
    expect(reviewed.nextReviewDate).toBeNull();
    expect(reviewed.reviews).toHaveLength(1);
  });

  it('rejects a review that changes the measured segment', async () => {
    const directory = await repository();
    await addSeoWatchword(directory, { keyword: 'first', targetPath: '/first', priority: 'high' });
    await recordSeoRank(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 6, impressions: 20, clicks: 1,
      startDate: '2026-08-13', endDate: '2026-09-09', country: 'TWN', device: 'DESKTOP', observedAt: '2026-09-10T00:00:00Z',
    });
    await startSeoExperiment(directory, {
      keyword: 'first', date: '2026-09-10', searchIntent: 'Understand the service',
      gap: 'Missing inputs and outputs.', change: 'Added visible inputs and outputs.',
    });
    const mobile = await recordSeoRank(directory, {
      keyword: 'first', targetPath: '/first', source: 'gsc', position: 4, impressions: 30, clicks: 2,
      startDate: '2026-09-11', endDate: '2026-09-17', country: 'TWN', device: 'MOBILE', observedAt: '2026-09-18T00:00:00Z',
    });
    await expect(reviewSeoExperiment(directory, {
      keyword: 'first', outcome: 'improved', observationId: mobile.id, date: '2026-09-17',
    })).rejects.toThrow('same source, country, device, and search type');
  });
});
