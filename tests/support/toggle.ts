/** Builders for the enable and disable tests: the plugin ids written at scopes, and what a command printed. */
import type { TogglePlan } from '../../src/cli/enable-plan.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { facts, installed, type InstalledSpec } from './dependency-facts.ts';
import type { GraphFacts } from '../../src/marketplace/dependency-graph.ts';
import type { InstallScope } from '../../src/marketplace/install-scopes.ts';

/** The graph with `enabledPlugins` values and no install records (a synced or hand-written entry). */
export const settingsOnly = (
  enabled: Partial<Record<InstallScope, Record<string, boolean>>>,
): GraphFacts => ({ installed: [], enabled, catalog: {}, allowlists: {} });

export const human = (plan: TogglePlan) => renderCommand(plan.output, { json: false });

export const jsonLine = (plan: TogglePlan): Record<string, unknown> =>
  JSON.parse(renderCommand(plan.output, { json: true }).stdout.at(-1) ?? '{}');

/** The facts of plugins installed as `[id, spec]` pairs, with an empty catalog. */
export const world = (...have: readonly (readonly [string, InstalledSpec?])[]): GraphFacts =>
  facts(
    [],
    have.map(([id, one]) => installed(id, one)),
  );
