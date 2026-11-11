/**
 * Builders for the `plugin install` and `plugin update` tests: a catalog with plain, command-source
 * and `headersHelper` entries, the start and plan of an install in one call, and what a run printed.
 */
import { planInstall, type InstallFound, type InstallRun } from '../../src/cli/install-plan.ts';
import {
  startInstall,
  type InstallArguments,
  type InstallContext,
  type PendingInstall,
} from '../../src/cli/install-start.ts';
import type { ShownCommand } from '../../src/cli/command-acceptance.ts';
import { renderCommand } from '../../src/cli/result.ts';
import type { CatalogPlugin, GraphFacts } from '../../src/marketplace/dependency-graph.ts';
import type { Sha256 } from '../../src/ports/marketplace.ts';
import { facts, installed, plugin, type Installed } from './dependency-facts.ts';
import { fakeEnvironment, fixedClock } from './ports.ts';

/** A real SHA-256 (a test may use `node:crypto`; `src/` may not), so a digest changes with its input. */
export const realSha256: Sha256 = {
  hex: async (bytes) => {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(bytes).digest('hex');
  },
};

export const COMMAND_ENTRY: CatalogPlugin = plugin('hooked', {
  source: { kind: 'command', command: 'node build.js', timeoutSeconds: 60, mode: 'copy' },
})[1];

export const HEADERS_ENTRY: CatalogPlugin = plugin('helped', { headersHelper: '/opt/mint.sh' })[1];

export interface Setup {
  readonly args?: Partial<InstallArguments>;
  readonly catalog?: readonly (readonly [string, CatalogPlugin])[];
  readonly have?: readonly Installed[];
  readonly graph?: Partial<GraphFacts>;
  readonly found?: Partial<InstallFound>;
  readonly context?: Partial<InstallContext>;
}

const NOW = 1_000_000;

export const contextOf = (extra: Partial<InstallContext> = {}): InstallContext => ({
  marketplaces: [],
  env: fakeEnvironment(),
  clock: fixedClock(NOW),
  session: false,
  tty: false,
  ...extra,
});

const FORMATTER = plugin('formatter');

function pendingOf(setup: Setup = {}): PendingInstall {
  const begun = startInstall({ plugin: 'formatter@m', ...setup.args }, contextOf(setup.context));
  if (begun.kind !== 'prepare') throw new Error('the install ended before the lookup');
  return begun.pending;
}

const foundOf = (setup: Setup = {}): InstallFound => ({
  graph: facts(setup.catalog ?? [FORMATTER], setup.have ?? [], setup.graph),
  catalog: 'catalog-v1',
  options: { declared: {} },
  ...setup.found,
});

export const run = (setup: Setup = {}): Promise<InstallRun> =>
  planInstall(pendingOf(setup), foundOf(setup), realSha256);

export const printed = (found: InstallRun, json = false) => {
  if (!('output' in found)) throw new Error('the install asked a question');
  return renderCommand(found.output, { json, before: found.before });
};

export const effectsOf = (found: InstallRun) => ('effects' in found ? found.effects : undefined);

export const lastJson = (found: InstallRun): Record<string, unknown> =>
  JSON.parse(printed(found, true).stdout.at(-1) ?? '{}');

export { installed, plugin };

/** The `shownCommand` of a failed result's last JSON line. */
export function shownCommandOf(found: InstallRun): ShownCommand {
  const shown = lastJson(found)['shownCommand'];
  if (typeof shown !== 'object' || shown === null) throw new Error('no shownCommand');
  const {
    command,
    plugin: owner,
    sha256,
    acceptCommandMatched,
  } = {
    command: Reflect.get(shown, 'command'),
    plugin: Reflect.get(shown, 'plugin'),
    sha256: Reflect.get(shown, 'sha256'),
    acceptCommandMatched: Reflect.get(shown, 'acceptCommandMatched'),
  };
  if (typeof command !== 'string' || typeof owner !== 'string' || typeof sha256 !== 'string') {
    throw new Error('a malformed shownCommand');
  }
  return typeof acceptCommandMatched === 'boolean'
    ? { command, plugin: owner, sha256, acceptCommandMatched }
    : { command, plugin: owner, sha256 };
}
