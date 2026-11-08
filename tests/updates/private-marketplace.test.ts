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
  type Credentials,
} from '../../src/updates/private-marketplace.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const ssh = (keyInAgent: boolean): Credentials => ({ remote: 'ssh', keyInAgent });
const https = (helper: 'supplies-stored-credential' | 'must-prompt' | 'none'): Credentials => ({
  remote: 'https',
  helper,
});

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
    // the credentials are what the helper and the agent hold; a token in the environment is not one
    expect(backgroundCheckAuthenticates(https('none'))).toBe(false);
    expect(backgroundCheckAuthenticates(ssh(false))).toBe(false);
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
  });
});
