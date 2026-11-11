/**
 * plugins/mods/api.md § Show something without starting a turn: `$.ui.notify` "resolves to
 * `{ isSent: true, channel }`" or "`{ isSent: false, reason }`" with `disabled`, `no-channel` and
 * `no-surface`; the channel is the host's, so the kit passes its answer through unchanged.
 */
import { expect, test } from 'bun:test';
import { uiRules } from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const A = 'mods.apiGuide.Show something without starting a turn.';

async function notifyAnswering(answer: { isSent: boolean; reason?: string; channel?: string }) {
  const { iface } = fakeInterface({ notify: () => Promise.resolve(answer as never) });
  const h = await apiHarness({ rules: uiRules, ui: uiOver(iface) });
  return h.api.ui.notify('Turn finished');
}

for (const reason of ['disabled', 'no-channel', 'no-surface'] as const) {
  spec(`${A}${reason}`, () => {
    test(`the host's { isSent: false, reason: "${reason}" } reaches the mod unchanged`, async () => {
      expect(await notifyAnswering({ isSent: false, reason })).toEqual({ isSent: false, reason });
    });
  });
}

spec(`${A}$.ui.notify(text)`, () => {
  test('a sent notification resolves to { isSent: true, channel }', async () => {
    expect(await notifyAnswering({ isSent: true, channel: 'terminal_bell' })).toEqual({
      isSent: true,
      channel: 'terminal_bell',
    });
  });
});
