/** Helpers for the settings `env` tests: one layer per scope, and the resolver with a trusted folder. */
import { resolveSettingsEnv } from '../../src/settings/index.ts';
import type { PolicyScope, PolicyLayer } from '../../src/settings/index.ts';

export const envLayer = (scope: PolicyScope, env: Record<string, string>) => ({
  scope,
  settings: { env },
});

const trusted = { isFolderTrusted: () => true };

export const resolveEnvOf = (
  layers: PolicyLayer[],
  context: Partial<Parameters<typeof resolveSettingsEnv>[1]> = {},
) => resolveSettingsEnv(layers, { ...trusted, ...context });

export const envValues = (layers: PolicyLayer[], context = {}) =>
  resolveEnvOf(layers, context).values;
