/** One case per skip reason: the plan override that gives it, and the whole clause the note says. */
import { readPackageJson } from '../../src/marketplace/node-deps-spec.ts';
import type { SkipReason } from '../../src/marketplace/node-deps-types.ts';
import { bunLock, npmLock, REGISTRY_TARBALL } from './node-deps-fixtures.ts';
import { ROOT, type Override } from './node-deps-plan.ts';

export interface ClauseCase {
  readonly over: Override;
  readonly clause: string;
  /** False for a plugin loaded in place: it has no cached copy to show the note on. */
  readonly cached: boolean;
}

const lockfile = (packages: Record<string, unknown>) => ({
  'package-lock.json': npmLock({ packages }),
});

/** One case per reason: the plan override that gives it, and the whole clause the note says. */
export const CLAUSES: { readonly [R in SkipReason]: ClauseCase } = {
  'loaded-in-place': {
    over: { origin: 'in-place' },
    clause: 'it loads in place and Claude Code does not install packages into a source directory',
    cached: false,
  },
  'link-mode': {
    over: { origin: 'linked' },
    clause:
      'a link-mode plugin gets no install; the directory it links to has to contain the packages in node_modules already',
    cached: true,
  },
  'no-package-json': {
    over: { packageJson: undefined },
    clause: 'it has no package.json',
    cached: true,
  },
  'package-json-unreadable': {
    over: { packageJson: readPackageJson([]) },
    clause: 'its package.json is not a readable JSON object',
    cached: true,
  },
  'no-lockfile': {
    over: { lockfiles: {} },
    clause: 'it has no bun.lock, npm-shrinkwrap.json or package-lock.json lockfile',
    cached: true,
  },
  'unsupported-lockfile': {
    over: { lockfiles: {}, otherLockfiles: ['bun.lockb', 'yarn.lock'] },
    clause:
      "it has a bun.lockb lockfile, Bun's binary format, which Claude Code cannot check; the plugin's author has to ship a text bun.lock or an npm lockfile instead; and it has a yarn.lock lockfile, which Claude Code does not install from; the plugin’s author has to replace it with an npm lockfile",
    cached: true,
  },
  'lockfile-format': {
    over: { lockfiles: { 'package-lock.json': npmLock({ version: 1 }) } },
    clause:
      'its package-lock.json has a lockfileVersion of 1 that Claude Code does not read (npm needs 2 or 3, bun.lock no higher than 2)',
    cached: true,
  },
  'package-manager-missing': {
    over: { lockfiles: { 'bun.lock': bunLock() }, available: ['npm'] },
    clause:
      'its lockfile needs bun, and bun is not installed on this computer; install it, then update the plugin',
    cached: true,
  },
  overrides: {
    over: {
      packageJson: readPackageJson({
        dependencies: { 'left-pad': '^1.3.0' },
        overrides: { x: '1' },
      }),
    },
    clause: 'its package.json sets npm overrides, which the install does not apply',
    cached: true,
  },
  'patched-dependencies': {
    over: {
      lockfiles: { 'bun.lock': bunLock() },
      packageJson: readPackageJson({
        dependencies: { 'left-pad': '^1.3.0' },
        patchedDependencies: { 'left-pad@1.3.0': 'p.patch' },
      }),
    },
    clause: 'its package.json sets Bun patchedDependencies, which the install does not apply',
    cached: true,
  },
  'non-registry-dependency': {
    over: {
      packageJson: readPackageJson({ dependencies: { a: 'file:../a', 'left-pad': '^1.3.0' } }),
    },
    clause:
      'it has dependencies that are not registry packages (a: it is a folder dependency); only registry packages pinned to an exact version are installed',
    cached: true,
  },
  'unpinned-dependency': {
    over: {
      lockfiles: lockfile({
        'node_modules/left-pad': { version: '^1.3.0', resolved: REGISTRY_TARBALL },
      }),
    },
    clause:
      'it has packages that are not pinned to an exact version in its lockfile (left-pad@^1.3.0); only registry packages pinned to an exact version are installed',
    cached: true,
  },
  'insecure-download': {
    over: {
      lockfiles: lockfile({
        'node_modules/y': { version: '1.0.0', resolved: 'http://example.com/y.tgz' },
      }),
    },
    clause: 'its lockfile has a download link that is not https (http://example.com/y.tgz)',
    cached: true,
  },
  'lockfile-mismatch': {
    over: { packageJson: readPackageJson({ dependencies: { 'left-pad': '^1.0.0' } }) },
    clause:
      'its package.json and its lockfile do not list the same dependencies (dependencies: left-pad)',
    cached: true,
  },
  'install-folder': {
    over: { installDir: `${ROOT}/.deps` },
    clause: `the install folder ${ROOT}/.deps lies inside the plugin`,
    cached: true,
  },
};
