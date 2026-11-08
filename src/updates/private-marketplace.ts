import type { Environment } from '../ports/environment.ts';
import { isOn } from './env-flags.ts';

/**
 * Background auto-update of a private marketplace (plugins/host-marketplace.md, "What background
 * auto-update does with credentials"; plugins/install.md, "Auto-update from a private
 * marketplace"). The check "uses the user's configured git credential helpers and never prompts".
 * Pure: the host runs git; the kit says whether the check can authenticate and what follows it.
 */

/** What authenticates a remote in the background. */
export type Credentials =
  | { readonly remote: 'ssh'; readonly keyInAgent: boolean }
  | {
      readonly remote: 'https';
      /** `supplies-stored-credential`: Git Credential Manager, the macOS Keychain helper or `git-credential-store` holding a credential; `must-prompt` cannot answer unattended. */
      readonly helper: 'supplies-stored-credential' | 'must-prompt' | 'none';
    };

const AUTHENTICATES: {
  readonly [R in Credentials['remote']]: (credentials: Credentials) => boolean;
} = {
  ssh: (credentials) => credentials.remote === 'ssh' && credentials.keyInAgent,
  https: (credentials) =>
    credentials.remote === 'https' && credentials.helper === 'supplies-stored-credential',
};

/**
 * Whether the unattended check authenticates. "If a user sets `GITHUB_TOKEN` or another provider
 * token in the environment, that alone doesn't authenticate the background check": the function
 * takes no environment, so a token cannot count. An SSH remote with no
 * key in the agent and an HTTPS remote with no helper are judgments (spec/judgments.md).
 */
export const backgroundCheckAuthenticates = (credentials: Credentials): boolean =>
  AUTHENTICATES[credentials.remote](credentials);

/** What the check found. */
export type CheckResult = 'up-to-date' | 'new-commits' | 'cannot-reach-or-authenticate';

export type CheckFollowUp = 'leave' | 'reclone' | 'keep-existing-checkout';

const KEEP_ON_FAILURE = 'CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE';

const FOLLOW_UPS: {
  readonly [R in CheckResult]: (env: Environment) => CheckFollowUp;
} = {
  'up-to-date': () => 'leave',
  'new-commits': () => 'reclone',
  'cannot-reach-or-authenticate': (env) =>
    isOn(env, KEEP_ON_FAILURE) ? 'keep-existing-checkout' : 'reclone',
};

/** "After the check, Claude Code does one of the following." */
export const afterBackgroundCheck = (result: CheckResult, env: Environment): CheckFollowUp =>
  FOLLOW_UPS[result](env);

/** "If that clone fails, the existing checkout stays in place." */
export const afterReclone = (
  cloneSucceeded: boolean,
): 'replace-checkout' | 'keep-existing-checkout' =>
  cloneSucceeded ? 'replace-checkout' : 'keep-existing-checkout';
