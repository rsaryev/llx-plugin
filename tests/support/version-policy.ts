/** Helpers of the Claude Code version policy tests: layers, a policy over them, a pick and a gate. */
import type { Settings } from '../../src/protocol/official.ts';
import type { PolicyLayer, PolicyScope } from '../../src/settings/layers.ts';
import {
  pickAllowedVersion,
  readVersionPolicy,
  startGate,
  type ClaudeCommand,
  type StartVerdict,
  type VersionPolicy,
} from '../../src/updates/claude-code-version-policy.ts';

export const layer = (scope: PolicyScope, settings: Settings): PolicyLayer => ({
  scope,
  settings,
});

export const policyOf = (...layers: PolicyLayer[]): VersionPolicy => readVersionPolicy(layers);

export const VERSIONS = { installed: '2.1.100', latest: '2.1.120', stable: '2.1.110' };

export const pick = (policy: VersionPolicy, versions: Partial<typeof VERSIONS> = {}) =>
  pickAllowedVersion(policy, { ...VERSIONS, ...versions });

export const gate = (
  policy: VersionPolicy,
  current: string,
  command: ClaudeCommand = 'start',
): StartVerdict => startGate(policy, { command, current });

/** The refusal's message, or an empty text for a verdict that lets the command run. */
export const messageOf = (verdict: StartVerdict): string =>
  verdict.allowed ? '' : verdict.message;
