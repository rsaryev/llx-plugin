/**
 * Builders for the `plugin uninstall` tests: the installed plugins, the start of an uninstall, the
 * conclusion after the host's writes, and what it printed.
 */
import { renderCommand } from '../../src/cli/result.ts';
import {
  concludeUninstall,
  startUninstall,
  type AfterRemoval,
  type UninstallArguments,
  type UninstallStart,
} from '../../src/cli/uninstall-plan.ts';
import type { InstalledRecord } from '../../src/marketplace/dependency-graph.ts';
import { facts, installed } from './dependency-facts.ts';

export const ID = 'formatter@my-marketplace';

export const world = (...have: Parameters<typeof installed>[]) =>
  facts(
    [],
    have.map(([id, one]) => installed(id, one)),
  );

export const unscoped = (graph = world([ID, { scope: 'user' }])): UninstallStart =>
  startUninstall({ plugin: ID }, { graph, tty: true });

export const start = (
  args: Partial<UninstallArguments>,
  graph = world([ID, { scope: 'project' }]),
  tty = true,
): UninstallStart => startUninstall({ plugin: ID, scope: 'project', ...args }, { graph, tty });

export const removing = (found: UninstallStart): Extract<UninstallStart, { kind: 'remove' }> => {
  if (found.kind !== 'remove') throw new Error(`expected a removal, got ${found.kind}`);
  return found;
};

const NOTHING_LEFT: AfterRemoval = { remaining: [] };

export const conclude = (
  args: Partial<UninstallArguments>,
  after: AfterRemoval = NOTHING_LEFT,
  graph = world([ID, { scope: 'project' }]),
) => concludeUninstall(removing(start(args, graph)), after);

export const record = (id: string, scope: InstalledRecord['scope'] = 'user'): InstalledRecord => ({
  id,
  scope,
  dependencies: [],
});

export const lines = (found: ReturnType<typeof conclude>, json = false) =>
  renderCommand(found.output, { json });

export const lastJson = (found: ReturnType<typeof conclude>): Record<string, unknown> => {
  const out = renderCommand(found.output, { json: true }).stdout;
  return JSON.parse(out.at(-1) ?? '{}');
};
