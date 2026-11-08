/** Builds the input of `planNodeDepsInstall` from lockfile texts, and unwraps its two outcomes. */
import { readLockfile, type LockfileName } from '../../src/marketplace/node-deps-lockfile.ts';
import { planNodeDepsInstall } from '../../src/marketplace/node-deps.ts';
import { readPackageJson } from '../../src/marketplace/node-deps-spec.ts';
import type {
  NodeDepsInput,
  NodeDepsInstall,
  NodeDepsPlan,
  NodeDepsSkip,
} from '../../src/marketplace/node-deps-types.ts';
import { npmLock } from './node-deps-fixtures.ts';

export const ROOT = '/home/u/.claude/plugins/cache/acme/formatter/1.0.0';
const INSTALL_DIR = '/tmp/kit-deps-1';
export const PACKAGE = readPackageJson({
  name: 'formatter',
  dependencies: { 'left-pad': '^1.3.0' },
});

const NAMES: readonly LockfileName[] = ['bun.lock', 'npm-shrinkwrap.json', 'package-lock.json'];

export type LockfileTexts = { readonly [N in LockfileName]?: string };

export type Override = Partial<Omit<NodeDepsInput, 'lockfiles'>> & {
  readonly lockfiles?: LockfileTexts;
};

export function input(over: Override = {}): NodeDepsInput {
  const { lockfiles = { 'package-lock.json': npmLock() }, ...rest } = over;
  return {
    origin: 'copied',
    pluginRoot: ROOT,
    installDir: INSTALL_DIR,
    join: (base, relative) => `${base}/${relative}`,
    packageJson: PACKAGE,
    lockfiles: Object.fromEntries(
      NAMES.flatMap((name) => {
        const text = lockfiles[name];
        return text === undefined ? [] : [[name, readLockfile(name, text)]];
      }),
    ),
    otherLockfiles: [],
    available: ['bun', 'npm'],
    ...rest,
  };
}

export const planned = (over: Override = {}): NodeDepsPlan => planNodeDepsInstall(input(over)).plan;

export function installed(over: Override = {}): NodeDepsInstall {
  const plan = planned(over);
  if (plan.action === 'skip') throw new Error(`expected an install, got ${JSON.stringify(plan)}`);
  return plan;
}

export function skipped(over: Override = {}): NodeDepsSkip {
  const plan = planned(over);
  if (plan.action === 'install') throw new Error(`expected a skip, got ${JSON.stringify(plan)}`);
  return plan;
}
