import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, '../../..');
const verifier = join(repositoryRoot, 'scripts/verify-release-v0.8.sh');
const expectedCommit = '0123456789abcdef0123456789abcdef01234567';
const tarballContent = 'verified geoptimize v0.8.1 candidate';
const expectedTarballHash = createHash('sha256').update(tarballContent).digest('hex');

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runVerifier(
  mockBin: string,
  packageHash: string,
  overrides: Record<string, string> = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [verifier, expectedCommit, packageHash], {
      env: {
        ...process.env,
        PATH: `${mockBin}:${process.env.PATH}`,
        MOCK_LATEST: '0.8.1',
        MOCK_NPM_GIT_HEAD: expectedCommit,
        MOCK_REPOSITORY_URL: 'git+https://github.com/cucuwang/geoptimize.git',
        MOCK_TAG_COMMIT: expectedCommit,
        MOCK_TARBALL_CONTENT: tarballContent,
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

describe('v0.6 public release verifier', () => {
  let testRoot: string;
  let mockBin: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'geoptimize-release-verifier-test-'));
    mockBin = join(testRoot, 'bin');
    await mkdir(mockBin);

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
    printf '{"dist-tags":{"latest":"%s"},"versions":{"0.8.1":{"gitHead":"%s","repository":{"url":"%s"},"homepage":"https://github.com/cucuwang/geoptimize","bugs":{"url":"https://github.com/cucuwang/geoptimize/issues"},"dist":{"tarball":"https://registry.npmjs.org/geoptimize/-/geoptimize-0.8.1.tgz"}}}}' "$MOCK_LATEST" "$MOCK_NPM_GIT_HEAD" "$MOCK_REPOSITORY_URL"
    ;;
  https://registry.npmjs.org/geoptimize/-/geoptimize-0.8.1.tgz)
    printf '%s' "$MOCK_TARBALL_CONTENT" > "$output_file"
    ;;
  https://api.github.com/repos/cucuwang/geoptimize/releases/tags/v0.8.1)
    printf '{"tag_name":"v0.8.1","draft":%s,"prerelease":%s}' "$MOCK_RELEASE_DRAFT" "$MOCK_RELEASE_PRERELEASE" > "$output_file"
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
printf '%s\trefs/tags/v0.8.1\n' "$MOCK_TAG_COMMIT"
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
mkdir -p "$prefix/node_modules/.bin"
for binary in geoptimize geo geo-cli; do
  if [ "$binary" = "$MOCK_MISSING_BINARY" ]; then
    continue
  fi
  printf '#!/usr/bin/env bash\nprintf "0.8.1\\n"\n' > "$prefix/node_modules/.bin/$binary"
  chmod +x "$prefix/node_modules/.bin/$binary"
done
`);
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('passes only when npm metadata, tarball, aliases, tag, and Release match', async () => {
    const result = await runVerifier(mockBin, expectedTarballHash);
    const npmArgs = await readFile(join(testRoot, 'npm-args.txt'), 'utf8');

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('PASS: npm gitHead matches');
    expect(result.stdout).toContain('PASS: npm tarball SHA-256 matches the verified candidate');
    expect(result.stdout).toContain('All public release checks passed.');
    expect(npmArgs).toMatch(/geoptimize-0\.8\.1\.tgz/);
    expect(npmArgs).not.toContain('geoptimize@0.8.1');
  });

  it('fails closed when npm serves a different tarball', async () => {
    const differentHash = createHash('sha256').update('different candidate').digest('hex');
    const result = await runVerifier(mockBin, differentHash);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: npm tarball SHA-256 is');
    expect(result.stdout).not.toContain('All public release checks passed.');
  });

  it('accepts a missing optional gitHead when the tarball identity matches', async () => {
    const result = await runVerifier(mockBin, expectedTarballHash, { MOCK_NPM_GIT_HEAD: '' });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('INFO: npm does not expose gitHead');
    expect(result.stdout).toContain('PASS: npm tarball SHA-256 matches the verified candidate');
  });

  it('fails closed when npm exposes a different gitHead', async () => {
    const differentCommit = 'fedcba9876543210fedcba9876543210fedcba98';
    const result = await runVerifier(mockBin, expectedTarballHash, { MOCK_NPM_GIT_HEAD: differentCommit });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`FAIL: npm gitHead is ${differentCommit}`);
  });

  it('fails closed when an alias is missing from the verified tarball', async () => {
    const result = await runVerifier(mockBin, expectedTarballHash, { MOCK_MISSING_BINARY: 'geo-cli' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: geo-cli returned no version');
  });

  it('fails closed when the Git tag points to a different commit', async () => {
    const result = await runVerifier(mockBin, expectedTarballHash, {
      MOCK_TAG_COMMIT: 'fedcba9876543210fedcba9876543210fedcba98',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: v0.8.1 points to');
  });

  it('fails closed when the GitHub Release is a draft', async () => {
    const result = await runVerifier(mockBin, expectedTarballHash, { MOCK_RELEASE_DRAFT: 'true' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: GitHub Release is not a published non-prerelease');
  });

  it('fails closed when public repository identity changes', async () => {
    const result = await runVerifier(mockBin, expectedTarballHash, {
      MOCK_REPOSITORY_URL: 'git+https://github.com/example/other.git',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FAIL: npm repository identity does not match');
  });
});
