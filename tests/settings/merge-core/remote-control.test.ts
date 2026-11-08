/**
 * settings.md § Exceptions to managed settings precedence (`remoteControlAtStartup`: "`false` from
 * `.claude/settings.json` or `.claude/settings.local.json` ... Honored even when a managed source
 * sets `true`; a project or local `true` is ignored"), § A value you set is ignored.
 */
import { describe, expect, test } from 'bun:test';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const view = (...layers: Parameters<typeof layerOf>[]) =>
  createGeneralView(layers.map(([scope, raw]) => layerOf(scope, raw)));

spec(
  'settingsMerge.settings.Exceptions to managed settings precedence.remoteControlAtStartup',
  () => {
    describe('a repository can turn auto-connect off but not on', () => {
      test('a project or local false beats a user true too, and a repository can turn auto-connect off but not on', () => {
        for (const scope of ['project', 'local'] as const) {
          expect(
            view(
              ['user', { remoteControlAtStartup: true }],
              [scope, { remoteControlAtStartup: false }],
            ).get('remoteControlAtStartup'),
          ).toBe(false);
          expect(
            view(
              ['user', { remoteControlAtStartup: true }],
              [scope, { remoteControlAtStartup: true }],
            ).get('remoteControlAtStartup'),
          ).toBe(true);
        }
      });
    });
  },
);
