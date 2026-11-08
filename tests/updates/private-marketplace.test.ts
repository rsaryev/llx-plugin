/**
 * plugins/install.md § Auto-update from a private marketplace, which points at
 * plugins/host-marketplace.md § What background auto-update does with credentials: the background
 * check uses the user's configured git credential helpers and never prompts (an SSH key in
 * `ssh-agent`, an HTTPS helper that supplies a stored credential authenticate it; a helper that must
 * prompt cannot, and the update fails quietly), a provider token in the environment alone does not
 * authenticate it, and after the check Claude Code leaves an up-to-date checkout, or re-clones when it
 * finds new commits or cannot reach or authenticate, keeping the existing checkout if the clone
 * fails, or keeping it without cloning when `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1`.
 * What a remote with no agent key or no helper does is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  afterBackgroundCheck,
  afterReclone,
  backgroundCheckAuthenticates,
  backgroundCheckResult,
  type Credentials,
} from '../../src/updates/private-marketplace.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const ssh = (keyInAgent: boolean, providerTokenInEnvironment = false): Credentials => ({
  remote: 'ssh',
  keyInAgent,
  providerTokenInEnvironment,
});
const https = (
  helper: 'supplies-stored-credential' | 'must-prompt' | 'none',
  providerTokenInEnvironment = false,
): Credentials => ({ remote: 'https', helper, providerTokenInEnvironment });
const NEW_COMMITS = { reachable: true, hasNewCommits: true };

spec('updates.guide.Auto-update from a private marketplace', () => {
  test('an SSH remote authenticates with a key loaded in ssh-agent', () => {
    expect(backgroundCheckAuthenticates(ssh(true))).toBe(true);
  });

  test('an HTTPS remote authenticates through a helper that supplies a stored credential without prompting', () => {
    expect(backgroundCheckAuthenticates(https('supplies-stored-credential'))).toBe(true);
  });

  test('an HTTPS helper that needs to prompt cannot answer in the background', () => {
    expect(backgroundCheckAuthenticates(https('must-prompt'))).toBe(false);
  });

  test('GITHUB_TOKEN or another provider token alone does not authenticate the check', () => {
    expect(backgroundCheckAuthenticates(https('must-prompt', true))).toBe(false);
    // and it changes nothing when a real credential is there
    expect(backgroundCheckAuthenticates(https('supplies-stored-credential', true))).toBe(true);
  });

  test('a helper that must prompt fails quietly: the check cannot authenticate, and the existing checkout stays when the clone fails too', () => {
    const result = backgroundCheckResult(https('must-prompt', true), NEW_COMMITS);
    expect(result).toBe('cannot-reach-or-authenticate');
    expect(afterBackgroundCheck(result, fakeEnvironment())).toBe('reclone');
    expect(afterReclone(false)).toBe('keep-existing-checkout');
  });

  test('with a credential that authenticates the check finds new commits, or finds the checkout up to date', () => {
    expect(backgroundCheckResult(ssh(true), NEW_COMMITS)).toBe('new-commits');
    expect(backgroundCheckResult(ssh(true), { reachable: true, hasNewCommits: false })).toBe(
      'up-to-date',
    );
    expect(backgroundCheckResult(ssh(true), { reachable: false, hasNewCommits: false })).toBe(
      'cannot-reach-or-authenticate',
    );
  });

  test('an up-to-date checkout is left as it is', () => {
    expect(afterBackgroundCheck('up-to-date', fakeEnvironment())).toBe('leave');
  });

  test('new commits, or a remote it cannot reach or authenticate to, clone the marketplace again', () => {
    expect(afterBackgroundCheck('new-commits', fakeEnvironment())).toBe('reclone');
    expect(afterBackgroundCheck('cannot-reach-or-authenticate', fakeEnvironment())).toBe('reclone');
  });

  test('a failed clone keeps the existing checkout; a good one replaces it', () => {
    expect(afterReclone(false)).toBe('keep-existing-checkout');
    expect(afterReclone(true)).toBe('replace-checkout');
  });

  test('CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1 keeps the checkout without cloning when the remote cannot be reached', () => {
    const env = fakeEnvironment({ CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE: '1' });
    expect(afterBackgroundCheck('cannot-reach-or-authenticate', env)).toBe(
      'keep-existing-checkout',
    );
  });

  test('that variable does not stop a re-clone for new commits', () => {
    const env = fakeEnvironment({ CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE: '1' });
    expect(afterBackgroundCheck('new-commits', env)).toBe('reclone');
  });
});

describe('private marketplace, what the docs leave open (spec/judgments.md)', () => {
  test('an SSH remote with no key in the agent, and an HTTPS remote with no helper, do not authenticate', () => {
    expect(backgroundCheckAuthenticates(ssh(false))).toBe(false);
    expect(backgroundCheckAuthenticates(https('none'))).toBe(false);
    expect(backgroundCheckAuthenticates(https('none', true))).toBe(false);
    expect(backgroundCheckAuthenticates(ssh(false, true))).toBe(false);
  });
});
