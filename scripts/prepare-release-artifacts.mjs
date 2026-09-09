import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// No build or pack here: export the exact tarball that passed release:check.
const out = realpathSync(process.argv[2]);
const root = resolve(import.meta.dirname, '..');
if (out === root || out.startsWith(root + '/')) throw new Error('Use an artifact directory outside the checkout');
const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
const manifest = JSON.parse(readFileSync(join(out, 'candidate.json')));
if (pkg.name !== 'geoptimize' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Unexpected package identity');
if (manifest.version !== pkg.version || manifest.filename !== `geoptimize-${pkg.version}.tgz`) throw new Error('Candidate identity mismatch');
const hash = data => createHash('sha256').update(data).digest('hex');
const tgz = join(out, manifest.filename);
if (hash(readFileSync(tgz)) !== manifest.sha256) throw new Error('Candidate hash mismatch');
const packed = JSON.parse(execFileSync('tar', ['-xOf', tgz, 'package/package.json'], {encoding: 'utf8'}));
for (const field of ['name', 'version', 'repository', 'dependencies', 'bin']) {
  if (JSON.stringify(packed[field]) !== JSON.stringify(pkg[field])) throw new Error(`Packed ${field} mismatch`);
}
const sbom = JSON.parse(execFileSync('npm', ['sbom', '--sbom-format=spdx', '--package-lock-only', '--omit=dev'], {cwd: root, encoding:'utf8'}));
if (sbom.spdxVersion !== 'SPDX-2.3') throw new Error('Unexpected SPDX format');
const subject = sbom.packages.find(p => p.name === pkg.name && p.versionInfo === pkg.version);
if (!subject || !sbom.documentDescribes.includes(subject.SPDXID)) throw new Error('SBOM root mismatch');
subject.packageFileName = manifest.filename;
subject.checksums = [{algorithm: 'SHA256', checksumValue: manifest.sha256}];
subject.sourceInfo = 'Production dependency resolution from the release commit package-lock.json; npm consumers may resolve different versions within declared ranges.';
const name = `geoptimize-${pkg.version}.spdx.json`;
const data = JSON.stringify(sbom, null, 2) + '\n';
writeFileSync(join(out, name), data);
writeFileSync(join(out, 'SHA256SUMS'), `${manifest.sha256}  ${manifest.filename}\n${hash(data)}  ${name}\n`);
console.log(`Prepared ${manifest.filename}, ${name}, SHA256SUMS`);
