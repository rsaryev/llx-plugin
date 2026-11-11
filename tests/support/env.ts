/** Helpers of the `env` tests: settings layers read the way a host reads them, and a session's environment. */
import {
  resolveEnv,
  type EnvInput,
  type EnvResolution,
  type EnvTrust,
} from '../../src/settings/env/index.ts';
import type { PolicyScope } from '../../src/settings/index.ts';
import { layerOf } from './settings-layers.ts';

/** One settings file: its scope and the variables of its `env`. */
export type EnvFile = readonly [PolicyScope, Record<string, string>];

export const TRUSTED: EnvTrust = { interactive: true, trusted: true };
export const UNTRUSTED: EnvTrust = { interactive: true, trusted: false };
export const PRINT_MODE: EnvTrust = { interactive: false, trusted: false };

/** The environment a session gets from files holding `env`, under the given trust and shell. */
export function sessionEnv(
  files: readonly EnvFile[],
  options: Partial<Omit<EnvInput, 'layers'>> = {},
): EnvResolution {
  return resolveEnv({
    layers: files.map(([scope, env]) => layerOf(scope, { env })),
    trust: TRUSTED,
    shell: {},
    ...options,
  });
}
