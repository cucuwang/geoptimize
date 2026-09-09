import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, '../../..');
const verifier = join(repositoryRoot, 'scripts/verify-publish-source.sh');
const mainCommit = '0123456789abcdef0123456789abcdef01234567';

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runVerifier(mockBin: string, overrides: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [verifier], {
      env: {
        ...process.env,
        PATH: `${mockBin}:${process.env.PATH}`,
        MOCK_HEAD: mainCommit,
        MOCK_MAIN: mainCommit,
        MOCK_MISSING_MAIN: 'false',
        ...overrides,
      },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('publish source gate', () => {
  let testRoot: string;
  let mockBin: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'geoptimize-publish-source-test-'));
    mockBin = join(testRoot, 'bin');
    await mkdir(mockBin);
    const gitMock = join(mockBin, 'git');
    await writeFile(gitMock, `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "rev-parse --verify HEAD")
    printf '%s\\n' "$MOCK_HEAD"
    ;;
  "rev-parse --verify refs/remotes/origin/maintenance/geoptimize-0.8")
    if [ "$MOCK_MISSING_MAIN" = "true" ]; then exit 1; fi
    printf '%s\\n' "$MOCK_MAIN"
    ;;
  *)
    printf 'unexpected git arguments: %s\\n' "$*" >&2
    exit 2
    ;;
esac
`, 'utf8');
    await chmod(gitMock, 0o755);
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('passes only at the exact origin/maintenance/geoptimize-0.8 commit', async () => {
    const result = await runVerifier(mockBin);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('HEAD matches origin/maintenance/geoptimize-0.8');
  });

  it('fails when HEAD differs from origin/maintenance/geoptimize-0.8', async () => {
    const result = await runVerifier(mockBin, {
      MOCK_HEAD: 'fedcba9876543210fedcba9876543210fedcba98',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('expected origin/maintenance/geoptimize-0.8');
  });

  it('fails when origin/maintenance/geoptimize-0.8 is unavailable', async () => {
    const result = await runVerifier(mockBin, { MOCK_MISSING_MAIN: 'true' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('run git fetch origin maintenance/geoptimize-0.8');
  });
});
