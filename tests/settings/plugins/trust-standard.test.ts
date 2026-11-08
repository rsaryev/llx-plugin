/** plugins/security.md § Official marketplace names; § Trust warning before you install. */
import { expect, test } from 'bun:test';
import { loadNameIssues } from '../../../src/format/marketplace/marketplace-names.ts';
import { trustWarning } from '../../../src/settings/plugins/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const STANDARD =
  "Make sure you trust a plugin before installing, updating, or using it. Anthropic does not control what MCP servers, files, or other software are included in plugins and cannot verify that they will work as intended or that they won't change. See each plugin's homepage for more information.";
for (const name of [
  'claude-plugins-official',
  'claude-code-marketplace',
  'claude-code-plugins',
  'anthropic-marketplace',
  'anthropic-plugins',
  'agent-skills',
  'anthropic-agent-skills',
  'life-sciences',
  'knowledge-work-plugins',
  'claude-for-legal',
  'claude-for-financial-services',
  'financial-services-plugins',
  'first-party-plugins',
  'claude-tag-plugins',
]) {
  spec(`trust.security.Official marketplace names.${name}`, () => {
    test('an official name admits Anthropic GitHub origins and refuses an impersonating source', () => {
      expect(
        loadNameIssues(name, {
          origin: { kind: 'github', repo: 'anthropics/plugins', path: 'm.json' },
        }),
      ).toEqual([]);
      expect(
        loadNameIssues(name, { origin: { kind: 'github', repo: 'other/plugins', path: 'm.json' } }),
      ).toContainEqual(expect.objectContaining({ severity: 'error' }));
    });
  });
}

spec('trust.security.Trust warning before you install', () => {
  test('uses the published warning by default and appends only the managed message', () => {
    expect(trustWarning(viewOf(['user', {}]))).toBe(STANDARD);
    expect(trustWarning(viewOf(['user', { pluginTrustMessage: 'unmanaged text' }]))).toBe(STANDARD);
    expect(trustWarning(viewOf(['managed', { pluginTrustMessage: 'Contact security.' }]))).toBe(
      `${STANDARD}\n\nContact security.`,
    );
  });
});
