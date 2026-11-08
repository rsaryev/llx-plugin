/**
 * settings-reference.md § `pluginTrustMessage` ("Add your organization's own text to the plugin trust
 * warning Claude Code shows before installation"; Scope: Managed; Default: "unset, so Claude Code
 * shows the standard warning alone"), plugins/org.md § "Control matrix" (`pluginTrustMessage`
 * "Appends your text to the trust warning that `/plugin` shows before a plugin installs"; "Doesn't
 * change the warning's own text"). The standard warning's text is not in the docs, so the host
 * supplies it and the kit returns it unchanged.
 */
import { describe, expect, test } from 'bun:test';
import { trustWarning } from '../../../src/settings/plugins/index.ts';
import { spec } from '../../support/spec.ts';
import { viewOf } from '../../support/plugin-settings.ts';

const standard = 'Make sure you trust a plugin before installing it.';
const message = 'All plugins from our marketplace are approved by IT';

spec(['settings.key.pluginTrustMessage', 'policy.org.Control matrix.pluginTrustMessage'], () => {
  test('unset shows the standard warning alone', () => {
    expect(trustWarning(viewOf(), standard)).toBe(standard);
    expect(trustWarning(viewOf(['managed', {}]), standard)).toBe(standard);
  });

  test('a managed message is appended: the standard warning stays whole and first', () => {
    const warning = trustWarning(viewOf(['managed', { pluginTrustMessage: message }]), standard);
    expect(warning.startsWith(standard)).toBe(true);
    expect(warning.endsWith(message)).toBe(true);
  });

  test('the key is managed only: user, project, local and --settings values change nothing', () => {
    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      expect(trustWarning(viewOf([scope, { pluginTrustMessage: message }]), standard)).toBe(
        standard,
      );
    }
  });

  test('a user message does not displace the managed one', () => {
    const view = viewOf(
      ['user', { pluginTrustMessage: 'user text' }],
      ['managed', { pluginTrustMessage: message }],
    );
    const warning = trustWarning(view, standard);
    expect(warning).toContain(message);
    expect(warning).not.toContain('user text');
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('the standard warning and the organization text are separated by a blank line', () => {
    const warning = trustWarning(viewOf(['managed', { pluginTrustMessage: message }]), standard);
    expect(warning).toBe(`${standard}\n\n${message}`);
  });

  test('an empty or blank message adds nothing', () => {
    for (const text of ['', '   \n']) {
      expect(trustWarning(viewOf(['managed', { pluginTrustMessage: text }]), standard)).toBe(
        standard,
      );
    }
  });
});
