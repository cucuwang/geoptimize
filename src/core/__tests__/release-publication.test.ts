import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const sha = 'a'.repeat(40);
function preflight(scenario: string) {
  const temp = mkdtempSync(join(tmpdir(), 'geoptimize-preflight-'));
  try {
    const bin = join(temp, 'bin'); mkdirSync(bin);
    const artifact = Buffer.from('verified-candidate-test-bytes');
    const digest = createHash('sha256').update(artifact).digest('hex');
    const filename = `geoptimize-${version}.tgz`;
    writeFileSync(join(temp, filename), artifact);
    writeFileSync(join(temp, 'candidate.json'), JSON.stringify({version, filename, sha256: digest}));
    writeFileSync(join(temp, 'SHA256SUMS'), `${digest}  ${filename}\n`);
    if (scenario === 'tampered') writeFileSync(join(temp, filename), 'changed');
    const executable = (name: string, body: string) => writeFileSync(join(bin, name), '#!/usr/bin/env bash\n' + body, {mode: 0o755});
    executable('git', `if [ "$1" = status ]; then
      [ "$SCENARIO" != dirty ] || echo ' M package.json'
      exit 0
    fi
    echo '${sha}'\n`);
    executable('gh', `case "$2" in
      */heads/main) if [ "$SCENARIO" = moved-main ]; then echo '${'b'.repeat(40)}'; else echo '${sha}'; fi ;;
      */git/ref/tags/*) if [ "$SCENARIO" = lightweight ]; then echo '{"object":{"type":"commit","sha":"${sha}"}}'; else echo '{"object":{"type":"tag","sha":"${sha}"}}'; fi ;;
      */git/tags/*) if [ "$SCENARIO" = unsigned ]; then verified=false; else verified=true; fi
        if [ "$SCENARIO" = wrong-commit ]; then commit='${'b'.repeat(40)}'; else commit='${sha}'; fi
        printf '{"verification":{"verified":%s},"object":{"type":"commit","sha":"%s"}}' "$verified" "$commit" ;;
      *) exit 2 ;;
    esac\n`);
    executable('npm', `if [ "$1" = --version ]; then echo 11.9.0; exit 0; fi
      if [ "$SCENARIO" = existing ]; then echo '"${version}"'; exit 0; fi
      if [ "$SCENARIO" = registry-error ]; then echo '{"error":{"code":"E503"}}'; else echo '{"error":{"code":"E404"}}'; fi
      exit 1\n`);
    return spawnSync('bash', ['scripts/verify-release-publication.sh', temp], {
      cwd: root, encoding:'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, SCENARIO: scenario,
        GITHUB_REPOSITORY:'cucuwang/geoptimize', GITHUB_SHA:sha, RELEASE_TAG:scenario === 'wrong-version' ? 'v999.0.0' : `v${version}`},
    });
  } finally { rmSync(temp, {recursive:true, force:true}); }
}
describe('publication preflight', () => {
  it('accepts verified source/tag/hash and explicit registry E404', () => {
    const result = preflight('valid');
    expect(result.status, result.stderr).toBe(0);
  });
  for (const scenario of ['dirty','moved-main','lightweight','unsigned','wrong-commit','wrong-version','tampered','existing','registry-error']) {
    it(`fails closed on ${scenario}`, () => expect(preflight(scenario).status).not.toBe(0));
  }
});
