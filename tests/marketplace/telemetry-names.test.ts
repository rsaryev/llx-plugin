/** plugins/security.md § Find plugins in telemetry; plugins/measure.md § Redacted plugin names in your backend. */
import { expect, test } from 'bun:test';
import { reportedNames } from '../../src/marketplace/telemetry-names.ts';
import { spec } from '../support/spec.ts';

const facts = { official: false, logToolDetails: false, plugin: 'acme-tool', marketplace: 'acme' };

spec(
  'policy.mods.Apply your plugin controls to mods.See which plugins load across your fleet',
  () => {
    test('plugin_loaded reports the literal third-party for a non-official plugin', () => {
      expect(reportedNames('plugin_loaded', facts)).toEqual({
        'plugin.name': 'third-party',
        'marketplace.name': 'third-party',
      });
    });
    test('plugin_installed omits the names instead', () => {
      expect(reportedNames('plugin_installed', facts)).toEqual({});
    });
    test('the official tier and OTEL_LOG_TOOL_DETAILS=1 report real names', () => {
      const real = { 'plugin.name': 'acme-tool', 'marketplace.name': 'acme' };
      expect(reportedNames('plugin_loaded', { ...facts, official: true })).toEqual(real);
      expect(reportedNames('plugin_installed', { ...facts, logToolDetails: true })).toEqual(real);
    });
  },
);
