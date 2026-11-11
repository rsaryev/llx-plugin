/** Helpers for the permission settings tests: the permissions policy of sources read the way a host reads them. */
import type { PolicyContext, PermissionsPolicy, StartInput } from '../../src/settings/index.ts';
import { resolved } from './policy-context.ts';
import type { Source } from './plugin-settings.ts';

/** The permissions policy of the sources, in the order given, on a machine with `context` on top of the plain one. */
export const permissionsOf = (
  sources: readonly Source[],
  context: Partial<PolicyContext> = {},
): PermissionsPolicy => resolved(sources, context).permissions;

/** A rule as `behavior:text@scope`, to compare lists without noise. */
export const ruleLines = (policy: PermissionsPolicy): string[] =>
  policy.rules.map((rule) => `${rule.behavior}:${rule.text}@${rule.scope}`);

/** A terminal session where auto mode is available, with `overrides`. */
export const terminal = (overrides: Partial<StartInput> = {}): StartInput => ({
  surface: 'terminal',
  autoAvailable: true,
  ...overrides,
});

export const headless = (overrides: Partial<StartInput> = {}): StartInput => ({
  surface: 'headless',
  autoAvailable: true,
  ...overrides,
});

/** The mode the session starts in, or the refusal. */
export const startedIn = (policy: PermissionsPolicy, input: StartInput): string => {
  const start = policy.startingMode(input);
  return start.outcome === 'started' ? start.mode : `refused: ${start.reason}`;
};
