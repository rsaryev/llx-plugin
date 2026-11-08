import { decideInstallMode } from '../../src/marketplace/install-mode.ts';
import type { InstallFinish } from '../../src/marketplace/install-plan.ts';
import type { InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import { createStoreLayout } from '../../src/marketplace/store-layout.ts';

/** What the tests of `planInstallFinish` share: a store at `/p`, a copied github plugin and its records. */
const join = (base: string, rel: string): string => `${base}/${rel}`;
const layout = createStoreLayout('/p', join);
export const AT = '2026-11-08T10:00:00.000Z';
export const LATER = '2026-11-09T10:00:00.000Z';

export const copy = (rest: Partial<InstallFinish> = {}): InstallFinish => {
  const decided = decideInstallMode({
    origin: { kind: 'marketplace', source: { kind: 'github', repo: 'acme/f' } },
    platform: 'posix',
  });
  if ('severity' in decided) throw new Error('expected a decision');
  return {
    name: 'formatter',
    marketplace: 'acme',
    decision: decided,
    version: { version: '1.0.0', origin: 'manifest' },
    layout,
    join,
    platform: 'posix',
    scope: 'user',
    existing: {},
    at: AT,
    ...rest,
  };
};

export const record = (installPath: string, rest: Partial<InstallRecord> = {}): InstallRecord => ({
  scope: 'user',
  installPath,
  version: 'v',
  installedAt: AT,
  ...rest,
});
