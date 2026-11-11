/**
 * The plugin keys behind one object: each method answers what the function of the same name answers
 * (the keys prove their behaviour in their own files, so this file is not under spec()).
 */
import { expect, test } from 'bun:test';
import { createPluginSettingsPolicy } from '../../../src/settings/plugins/index.ts';
import { plain } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';

test('the policy answers every plugin key from one view', () => {
  const policy = createPluginSettingsPolicy(
    viewOf(
      [
        'managed',
        {
          enabledPlugins: { 'guard@acme': true },
          prependPlugins: ['guard@acme'],
          pluginTrustMessage: 'Vetted by IT',
        },
      ],
      ['user', { syncClaudeAiPlugins: false, pluginConfigs: { 'p@m': { options: { a: 1 } } } }],
    ),
    { hasManagedSettings: true, account: 'console' },
  );
  expect(policy.enabled('guard@acme').decidedBy).toBe('managed');
  expect(policy.forceEnabledByManaged('guard@acme')).toBe(true);
  expect(plain(policy.config('p@m').options)).toEqual({ a: 1 });
  expect(plain(policy.modOrder(new Set(['guard@acme'])).prepend)).toEqual(['guard@acme']);
  expect(policy.syncClaudeAiPlugins().moveToTrash).toBe(true);
  expect(policy.trustWarning('Standard.')).toBe('Standard.\n\nVetted by IT');
});
