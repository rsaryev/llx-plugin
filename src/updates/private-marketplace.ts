import type { Environment } from '../ports/environment.ts';
import { isOn } from './env-flags.ts';

/**
 * Background auto-update of a private marketplace (plugins/host-marketplace.md, "What background
 * auto-update does with credentials"; plugins/install.md, "Auto-update from a private
 * marketplace"). The check "uses the user's configured git credential helpers and never prompts".
 * Pure: the host runs git; the kit says whether the check can authenticate and what follows it.
 */

/** What authenticates a remote in the background. */
export type Credentials = (
  | { readonly remote: 'ssh'; readonly keyInAgent: boolean }
  | {
      readonly remote: 'https';
      /** `supplies-stored-credential`: Git Credential Manager, the macOS Keychain helper or `git-credential-store` holding a credential; `must-prompt` cannot answer unattended. */
      readonly helper: 'supplies-stored-credential' | 'must-prompt' | 'none';
    }
) & {
  /** `GITHUB_TOKEN`, `GH_TOKEN` or another provider token is set in the environment. It never counts toward authenticating. */
  readonly providerTokenInEnvironment?: boolean;
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
 * reads only the key in the agent and the helper, so a token in the environment cannot count. An SSH remote with no
 * key in the agent and an HTTPS remote with no helper are judgments (spec/judgments.md).
 */
export const backgroundCheckAuthenticates = (credentials: Credentials): boolean =>
  AUTHENTICATES[credentials.remote](credentials);

/** What the host sees of the remote when the check runs. */
export interface RemoteState {
  /** The remote answers at all. */
  readonly reachable: boolean;
  /** Its default branch has commits the checkout lacks; only meaningful once the check authenticated. */
  readonly hasNewCommits: boolean;
}

/** What the check found. */
export type CheckResult = 'up-to-date' | 'new-commits' | 'cannot-reach-or-authenticate';

export type CheckFollowUp = 'leave' | 'reclone' | 'keep-existing-checkout';

/**
 * What the unattended check finds: a remote it cannot reach, or cannot authenticate to (a helper
 * that must prompt "fails quietly"), is `cannot-reach-or-authenticate`; otherwise whether the remote
 * has new commits.
 */
export function backgroundCheckResult(credentials: Credentials, remote: RemoteState): CheckResult {
  if (!remote.reachable || !backgroundCheckAuthenticates(credentials)) {
    return 'cannot-reach-or-authenticate';
  }
  return remote.hasNewCommits ? 'new-commits' : 'up-to-date';
}

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
