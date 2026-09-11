import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, '../../..');
const verifier = join(repositoryRoot, 'scripts/verify-release-v0.8.sh');
const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
const expectedVersion = packageJson.version as string;
const expectedCommit = '0123456789abcdef0123456789abcdef01234567';

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runVerifier(
  mockBin: string,
  tarballPath: string,
  packageHash: string,
  overrides: Record<string, string> = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [verifier, expectedCommit, packageHash], {
      env: {
        ...process.env,
        PATH: `${mockBin}:${process.env.PATH}`,
        MOCK_LATEST: expectedVersion,
        MOCK_NPM_GIT_HEAD: expectedCommit,
        MOCK_REPOSITORY_URL: 'git+https://github.com/cucuwang/geoptimize.git',
        MOCK_TAG_COMMIT: expectedCommit,
        MOCK_TARBALL_PATH: tarballPath,
        MOCK_RELEASE_DRAFT: 'false',
        MOCK_RELEASE_PRERELEASE: 'false',
        MOCK_MISSING_BINARY: '',
        MOCK_NPM_ARGS_FILE: join(dirname(mockBin), 'npm-args.txt'),
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

async function writeExecutable(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, 'utf8');
  await chmod(path, 0o755);
}

describe('public release verifier', () => {
  let testRoot: string;
  let mockBin: string;
  let tarballPath: string;
  let expectedTarballHash: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'geoptimize-release-verifier-test-'));
    mockBin = join(testRoot, 'bin');
    await mkdir(mockBin);
    tarballPath = join(testRoot, `geoptimize-${expectedVersion}.tgz`);
    const packageRoot = join(testRoot, 'package');
    await mkdir(packageRoot);
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify(packageJson), 'utf8');
    const tarResult = spawnSync('tar', ['-czf', tarballPath, 'package'], { cwd: testRoot, encoding: 'utf8' });
    if (tarResult.status !== 0) throw new Error(`Could not create tarball fixture: ${tarResult.stderr}`);
    expectedTarballHash = createHash('sha256').update(await readFile(tarballPath)).digest('hex');

    await writeExecutable(join(mockBin, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
output_file=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output_file=$2; shift 2 ;;
    -w) shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done

case "$url" in
  https://registry.npmjs.org/geoptimize)
    printf '{"dist-tags":{"latest":"%s"},"versions":{"${expectedVersion}":{"gitHead":"%s","repository":{"url":"%s"},"homepage":"https://github.com/cucuwang/geoptimize","bugs":{"url":"https://github.com/cucuwang/geoptimize/issues"},"dist":{"tarball":"https://registry.npmjs.org/geoptimize/-/geoptimize-${expectedVersion}.tgz"}}}}' "$MOCK_LATEST" "$MOCK_NPM_GIT_HEAD" "$MOCK_REPOSITORY_URL"
    ;;
  https://registry.npmjs.org/geoptimize/-/geoptimize-${expectedVersion}.tgz)
    if [ "\${MOCK_TARBALL_DOWNLOAD_FAIL:-0}" = "1" ]; then exit 22; fi
    cp "$MOCK_TARBALL_PATH" "$output_file"
    ;;
  https://api.github.com/repos/cucuwang/geoptimize/releases/tags/v${expectedVersion})
    printf '{"tag_name":"v${expectedVersion}","draft":%s,"prerelease":%s}' "$MOCK_RELEASE_DRAFT" "$MOCK_RELEASE_PRERELEASE" > "$output_file"
    printf '200'
    ;;
  *)
    printf 'unexpected curl URL: %s\n' "$url" >&2
    exit 22
    ;;
esac
`);

    await writeExecutable(join(mockBin, 'git'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\trefs/tags/v${expectedVersion}\n' "$MOCK_TAG_COMMIT"
`);

    await writeExecutable(join(mockBin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
prefix=
printf '%s\n' "$*" > "$MOCK_NPM_ARGS_FILE"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix) prefix=$2; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "\${MOCK_REJECT_PREFIX:-}" ] && [[ "$prefix" == "\${MOCK_REJECT_PREFIX}"/* ]]; then
  printf 'mock npm rejected symlink prefix: %s\n' "$prefix" >&2
  exit 64
fi
mkdir -p "$prefix/node_modules/.bin"
for binary in geoptimize geo geo-cli; do
  if [ "$binary" = "$MOCK_MISSING_BINARY" ]; then
    continue
  fi
  printf '#!/usr/bin/env bash\nprintf "${expectedVersion}\\n"\n' > "$prefix/node_modules/.bin/$binary"
  chmod +x "$prefix/node_modules/.bin/$binary"
done
`);
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('passes only when npm metadata, tarball, aliases, tag, and Release match', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash);
    const npmArgs = await readFile(join(testRoot, 'npm-args.txt'), 'utf8');

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('PASS: npm gitHead matches');
    expect(result.stdout).toContain('PASS: npm tarball SHA-256 matches the verified candidate');
    expect(result.stdout).toContain('All public release checks passed.');
    expect(npmArgs).toContain(' ci ');
    expect(npmArgs).toContain('--ignore-scripts');
    expect(npmArgs).toContain('--no-audit');
    expect(npmArgs).toContain('--no-fund');
    expect(npmArgs).not.toContain(' install ');
    expect(npmArgs).not.toContain(`geoptimize-${expectedVersion}.tgz`);
  });

  it('uses a physical verification path when TMPDIR is a symlink', async () => {
    const physicalTmp = join(testRoot, 'physical-tmp');
    const tmpAlias = join(testRoot, 'tmp-alias');
    await mkdir(physicalTmp);
    await symlink(physicalTmp, tmpAlias);

    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, {
      TMPDIR: tmpAlias,
      MOCK_REJECT_PREFIX: tmpAlias,
    });
    const npmArgs = await readFile(join(testRoot, 'npm-args.txt'), 'utf8');

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('All public release checks passed.');
    expect(npmArgs).toContain(realpathSync(physicalTmp));
    expect(npmArgs).not.toContain(tmpAlias);
  });

  it('fails closed when npm serves a different tarball', async () => {
    const differentHash = createHash('sha256').update('different candidate').digest('hex');
    const result = await runVerifier(mockBin, tarballPath, differentHash);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: npm tarball SHA-256 is');
    expect(result.stdout).not.toContain('All public release checks passed.');
    expect(existsSync(join(testRoot, 'npm-args.txt'))).toBe(false);
  });

  it('does not install when the npm tarball download fails', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, {
      MOCK_TARBALL_DOWNLOAD_FAIL: '1',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: npm tarball could not be downloaded');
    expect(existsSync(join(testRoot, 'npm-args.txt'))).toBe(false);
  });

  it('accepts a missing optional gitHead when the tarball identity matches', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, { MOCK_NPM_GIT_HEAD: '' });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('INFO: npm does not expose gitHead');
    expect(result.stdout).toContain('PASS: npm tarball SHA-256 matches the verified candidate');
  });

  it('fails closed when npm exposes a different gitHead', async () => {
    const differentCommit = 'fedcba9876543210fedcba9876543210fedcba98';
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, { MOCK_NPM_GIT_HEAD: differentCommit });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`FAIL: npm gitHead is ${differentCommit}`);
  });

  it('fails closed when an alias is missing from the verified tarball', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, { MOCK_MISSING_BINARY: 'geo-cli' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: geo-cli returned no version');
  });

  it('fails closed when the Git tag points to a different commit', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, {
      MOCK_TAG_COMMIT: 'fedcba9876543210fedcba9876543210fedcba98',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`FAIL: v${expectedVersion} points to`);
  });

  it('fails closed when the GitHub Release is a draft', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, { MOCK_RELEASE_DRAFT: 'true' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: GitHub Release is not a published non-prerelease');
  });

  it('fails closed when public repository identity changes', async () => {
    const result = await runVerifier(mockBin, tarballPath, expectedTarballHash, {
      MOCK_REPOSITORY_URL: 'git+https://github.com/example/other.git',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: npm repository identity does not match');
  });
});
