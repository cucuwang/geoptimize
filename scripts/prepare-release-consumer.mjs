import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_NAME = 'geoptimize';
const LOCKFILE_VERSION = 3;
const DEPENDENCY_CONTRACT_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundleDependencies',
  'bundledDependencies',
];
const PACKAGE_METADATA_FIELDS = [
  'name',
  'license',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bin',
  'engines',
  'os',
  'cpu',
  'libc',
  'funding',
  'deprecated',
];

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function sameValue(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Unable to read ${label} ${path}: ${detail}`);
  }
}

function assertSha256(value) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    fail('expected SHA-256 must be a lowercase 64-character hexadecimal digest');
  }
}

function digest(path, algorithm, encoding) {
  return createHash(algorithm).update(readFileSync(path)).digest(encoding);
}

function readPackedManifest(tarballPath) {
  let manifestText;
  try {
    manifestText = execFileSync(
      'tar',
      ['-xOf', tarballPath, 'package/package.json'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Unable to read package/package.json from ${tarballPath}: ${detail}`);
  }

  try {
    return JSON.parse(manifestText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Packed package/package.json is not valid JSON: ${detail}`);
  }
}

function dependencyContract(value, label) {
  if (!isRecord(value)) fail(`${label} must be a JSON object`);

  return Object.fromEntries(
    DEPENDENCY_CONTRACT_FIELDS
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => {
        const fieldValue = value[field];
        if (field === 'bundleDependencies' || field === 'bundledDependencies') {
          if (!Array.isArray(fieldValue)) fail(`${label}.${field} must be a JSON array`);
        } else if (!isRecord(fieldValue)) {
          fail(`${label}.${field} must be a JSON object`);
        }
        return [field, fieldValue];
      }),
  );
}

function validateManifest(manifest, sourceRoot) {
  if (!isRecord(manifest)) fail('Packed package manifest must be a JSON object');
  if (!isRecord(sourceRoot)) fail('Canonical lock root package must be a JSON object');
  if (sourceRoot.name !== PACKAGE_NAME) {
    fail(`Canonical lock root package name is ${sourceRoot.name ?? 'missing'}; expected ${PACKAGE_NAME}`);
  }
  if (typeof sourceRoot.version !== 'string' || sourceRoot.version.length === 0) {
    fail('Canonical lock root package version is missing');
  }
  if (manifest.name !== sourceRoot.name) {
    fail(`Packed package name is ${manifest.name ?? 'missing'}; expected ${sourceRoot.name}`);
  }
  if (manifest.version !== sourceRoot.version) {
    fail(`Packed package version is ${manifest.version ?? 'missing'}; expected ${sourceRoot.version}`);
  }

  const packedContract = dependencyContract(manifest, 'Packed package manifest');
  const lockContract = dependencyContract(sourceRoot, 'Canonical lock root package');
  if (!sameValue(packedContract, lockContract)) {
    fail('Packed package dependency contract does not match the canonical lock root package');
  }
}

function isIntegrity(value) {
  if (typeof value !== 'string') return false;
  const match = /^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;

  const expectedLength = {
    sha1: 28,
    sha256: 44,
    sha384: 64,
    sha512: 88,
  }[match[1]];
  const encoded = match[2];
  if (encoded.length !== expectedLength) return false;
  return Buffer.from(encoded, 'base64').toString('base64') === encoded;
}

function cloneWithoutDevelopmentMetadata(value) {
  const clone = JSON.parse(JSON.stringify(value));
  delete clone.dev;
  delete clone.devOptional;
  delete clone.devPeers;
  return clone;
}

function productionPackages(sourcePackages) {
  const packages = {};
  for (const [location, entry] of Object.entries(sourcePackages)) {
    if (location === '') continue;
    if (!location.startsWith('node_modules/')) {
      fail(`Canonical lock contains an unsupported package location: ${location}`);
    }
    if (!isRecord(entry)) fail(`Canonical lock entry ${location} must be a JSON object`);
    if (entry.dev === true) continue;
    if (entry.link === true) {
      fail(`Canonical lock production entry ${location} is a link`);
    }
    if (typeof entry.version !== 'string' || entry.version.length === 0) {
      fail(`Canonical lock production entry ${location} has no version`);
    }
    if (typeof entry.resolved !== 'string' || entry.resolved.length === 0) {
      fail(`Canonical lock production entry ${location} has no resolved source`);
    }
    if (!isIntegrity(entry.integrity)) {
      fail(`Canonical lock production entry ${location} has no valid integrity`);
    }
    packages[location] = cloneWithoutDevelopmentMetadata(entry);
  }
  return packages;
}

function validateCanonicalLock(lock, lockPath) {
  if (!isRecord(lock)) fail(`Canonical lock ${lockPath} must be a JSON object`);
  if (lock.lockfileVersion !== LOCKFILE_VERSION) {
    fail(`Canonical lock ${lockPath} must use lockfileVersion ${LOCKFILE_VERSION}`);
  }
  if (!isRecord(lock.packages)) fail(`Canonical lock ${lockPath} has no packages map`);
  if (!Object.hasOwn(lock.packages, '')) fail(`Canonical lock ${lockPath} has no root package entry`);

  const root = lock.packages[''];
  if (!isRecord(root)) fail(`Canonical lock ${lockPath} root package entry must be a JSON object`);
  if (root.name !== PACKAGE_NAME) {
    fail(`Canonical lock root package name is ${root.name ?? 'missing'}; expected ${PACKAGE_NAME}`);
  }
  if (typeof root.version !== 'string' || root.version.length === 0) {
    fail(`Canonical lock root package version is missing`);
  }
  if (!isRecord(root.dependencies)) {
    fail('Canonical lock root package has no dependencies contract');
  }

  return { root, packages: productionPackages(lock.packages) };
}

function ensureCleanConsumer(consumerPath) {
  if (!existsSync(consumerPath)) {
    mkdirSync(consumerPath, { recursive: true });
  }

  const stats = lstatSync(consumerPath);
  if (!stats.isDirectory()) fail(`Consumer path is not a directory: ${consumerPath}`);
  if (readdirSync(consumerPath).length !== 0) {
    fail(`Consumer directory must be empty: ${consumerPath}`);
  }
  return realpathSync(consumerPath);
}

function realFilePath(path, label) {
  let physicalPath;
  try {
    physicalPath = realpathSync(path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Unable to resolve ${label} ${path}: ${detail}`);
  }
  if (!lstatSync(physicalPath).isFile()) fail(`${label} is not a regular file: ${physicalPath}`);
  return physicalPath;
}

function consumerMetadata(tarballPath, manifest, sha512) {
  const entry = {
    version: manifest.version,
    resolved: `file:${tarballPath}`,
    integrity: `sha512-${sha512}`,
  };

  for (const field of PACKAGE_METADATA_FIELDS) {
    if (Object.hasOwn(manifest, field)) entry[field] = manifest[field];
  }
  return entry;
}

export function prepareReleaseConsumer(tarballArg, consumerArg, sourceLockArg, expectedSha256) {
  if (!tarballArg || !consumerArg || !sourceLockArg || !expectedSha256) {
    fail('usage: node scripts/prepare-release-consumer.mjs <tarball> <consumer-dir> <source-lock> <expected-sha256>');
  }
  assertSha256(expectedSha256);

  const tarballPath = realFilePath(resolve(tarballArg), 'Tarball path');
  const requestedConsumerPath = resolve(consumerArg);
  const sourceLockPath = realFilePath(resolve(sourceLockArg), 'Canonical source lock path');

  const actualSha256 = digest(tarballPath, 'sha256', 'hex');
  if (actualSha256 !== expectedSha256) {
    fail(`Tarball SHA-256 is ${actualSha256}; expected ${expectedSha256}`);
  }

  const sourceLock = readJson(sourceLockPath, 'canonical source lock');
  const { root: sourceRoot, packages } = validateCanonicalLock(sourceLock, sourceLockPath);
  const manifest = readPackedManifest(tarballPath);
  validateManifest(manifest, sourceRoot);

  const consumerPath = ensureCleanConsumer(requestedConsumerPath);
  const consumerPackage = {
    name: 'geoptimize-release-consumer',
    version: '0.0.0',
    private: true,
    dependencies: { [PACKAGE_NAME]: `file:${tarballPath}` },
  };
  const lockPackages = {
    '': {
      name: consumerPackage.name,
      version: consumerPackage.version,
      private: true,
      dependencies: consumerPackage.dependencies,
    },
    ...packages,
    'node_modules/geoptimize': consumerMetadata(
      tarballPath,
      manifest,
      digest(tarballPath, 'sha512', 'base64'),
    ),
  };
  const consumerLock = {
    name: consumerPackage.name,
    version: consumerPackage.version,
    lockfileVersion: LOCKFILE_VERSION,
    requires: true,
    packages: lockPackages,
  };

  writeFileSync(`${consumerPath}/package.json`, `${JSON.stringify(consumerPackage, null, 2)}\n`, 'utf8');
  writeFileSync(`${consumerPath}/package-lock.json`, `${JSON.stringify(consumerLock, null, 2)}\n`, 'utf8');
  return { tarballPath, consumerPath, sourceLockPath, sha256: actualSha256, sha512: digest(tarballPath, 'sha512', 'base64') };
}

function main() {
  try {
    const result = prepareReleaseConsumer(...process.argv.slice(2));
    console.log(`Prepared clean consumer metadata at ${result.consumerPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
