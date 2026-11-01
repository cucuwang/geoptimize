import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Action threshold validation (F6)', () => {
  it.each(['999999999999999999999999', '18446744073709551616', '000000000000000000101'])('rejects the overflowing min-score %s before scanning', async (minScore) => {
    const directory = await mkdtemp(join(tmpdir(), 'geoptimize-action-threshold-'));
    try {
      const cli = join(directory, 'cli.cjs');
      const marker = join(directory, 'scan-ran');
      await writeFile(cli, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); console.log('{"overall":{"total":50},"pages":[]}');`);
      const result = spawnSync('bash', [fileURLToPath(new URL('../../../action/run.sh', import.meta.url))], {
        encoding: 'utf8', timeout: 10000,
        env: { ...process.env, MIN_SCORE: minScore, FAIL_ON_LOW_SCORE: 'true', INPUT_PATH: 'fixture', GITHUB_OUTPUT: join(directory, 'output'), GEOPTIMIZE_CLI_PATH: cli },
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('min-score must be an integer from 0 to 100');
      await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('normalizes a large number of leading zeros before comparing the score', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geoptimize-action-threshold-'));
    try {
      const cli = join(directory, 'cli.cjs');
      await writeFile(cli, `console.log('{"overall":{"total":50},"pages":[]}');`);
      const result = spawnSync('bash', [fileURLToPath(new URL('../../../action/run.sh', import.meta.url))], {
        encoding: 'utf8', timeout: 10000,
        env: { ...process.env, MIN_SCORE: '00000000000000000051', FAIL_ON_LOW_SCORE: 'true', INPUT_PATH: 'fixture', GITHUB_OUTPUT: join(directory, 'output'), GEOPTIMIZE_CLI_PATH: cli },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('below the project threshold 51');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
