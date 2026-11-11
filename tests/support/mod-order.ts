/** Helpers for the mod-order tests: the machines, the docs' acme marketplace and one `modOrder` call. */
import {
  modOrder,
  type ModOrderContext,
  type ModOrderResult,
} from '../../src/settings/plugins/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

export const managedMachine: ModOrderContext = { hasManagedSettings: true, account: 'console' };
export const bareMachine: ModOrderContext = { hasManagedSettings: false, account: 'console' };
export const teamLogin: ModOrderContext = {
  hasManagedSettings: false,
  account: 'claudeaiTeamEnterprise',
};
export const orgMods = (...ids: string[]): ReadonlySet<string> => new Set(ids);

export const acme = (extra: object): Source => [
  'managed',
  {
    extraKnownMarketplaces: {
      'acme-tools': { source: { source: 'directory', path: '/opt/acme/claude-plugins' } },
    },
    enabledPlugins: { 'acme-guard@acme-tools': true, 'acme-audit@acme-tools': true },
    ...extra,
  },
];

export const order = (
  sources: readonly Source[],
  context: ModOrderContext,
  mods: ReadonlySet<string> = orgMods('acme-guard@acme-tools', 'acme-audit@acme-tools'),
): ModOrderResult => modOrder(viewOf(...sources), context, mods);

export const skippedIds = (result: ModOrderResult): readonly string[] =>
  result.skipped.map((entry) => entry.id);
