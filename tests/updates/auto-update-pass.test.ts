/**
 * plugins/loading.md § When auto-update runs: in an interactive session, after the first message,
 * Claude Code waits a random delay of up to ten minutes, then refreshes every marketplace with
 * auto-update on and updates the plugins installed from them, which the running session keeps
 * unloaded: `Plugin updated: <name> · Run /reload-plugins to apply`. No requirement id covers the
 * paragraph, so these tests are outside `spec(...)`. Localix's hourly pass is a host choice; the
 * kit plans one pass and the host decides how often to arm it.
 */
import { describe, expect, test } from 'bun:test';
import {
  FIRST_PASS_MAX_DELAY_MS,
  armFirstPass,
  firstPassDelayMs,
  planAutoUpdatePass,
  pluginUpdatedNotice,
} from '../../src/updates/auto-update-pass.ts';
import { fakeEnvironment, fixedClock } from '../support/ports.ts';

describe('the first pass (plugins/loading.md, "When auto-update runs")', () => {
  test('the delay is random and at most ten minutes', () => {
    expect(FIRST_PASS_MAX_DELAY_MS).toBe(10 * 60_000);
    expect(firstPassDelayMs(() => 0)).toBe(0);
    expect(firstPassDelayMs(() => 0.5)).toBe(300_000);
    expect(firstPassDelayMs(() => 1)).toBe(FIRST_PASS_MAX_DELAY_MS);
    expect(firstPassDelayMs(() => 7)).toBe(FIRST_PASS_MAX_DELAY_MS);
    expect(firstPassDelayMs(() => -1)).toBe(0);
  });

  test('the pass runs once, on the clock, after the delay', () => {
    const clock = fixedClock();
    let runs = 0;
    const armed = armFirstPass({
      clock,
      env: fakeEnvironment(),
      random: () => 0.25,
      run: () => {
        runs += 1;
      },
    });
    expect(armed.armed).toBe(true);
    clock.advance(149_999);
    expect(runs).toBe(0);
    clock.advance(1);
    expect(runs).toBe(1);
    clock.advance(FIRST_PASS_MAX_DELAY_MS * 2);
    expect(runs).toBe(1);
  });

  test('a cancelled pass never runs', () => {
    const clock = fixedClock();
    let runs = 0;
    const armed = armFirstPass({
      clock,
      env: fakeEnvironment(),
      random: () => 0,
      run: () => {
        runs += 1;
      },
    });
    armed.cancel();
    clock.advance(FIRST_PASS_MAX_DELAY_MS);
    expect(runs).toBe(0);
  });

  test('with the pass off by an environment variable nothing is armed, unless forced', () => {
    const clock = fixedClock();
    const off = armFirstPass({
      clock,
      env: fakeEnvironment({ DISABLE_AUTOUPDATER: '1' }),
      random: () => 0,
      run: () => {},
    });
    expect(off.armed).toBe(false);
    expect(clock.pending()).toBe(0);
    const forced = armFirstPass({
      clock,
      env: fakeEnvironment({ DISABLE_AUTOUPDATER: '1', FORCE_AUTOUPDATE_PLUGINS: '1' }),
      random: () => 0,
      run: () => {},
    });
    expect(forced.armed).toBe(true);
    expect(clock.pending()).toBe(1);
  });
});

const plugin = (id: string, extra: object = {}) => ({ id, candidate: extra });

describe('what one pass does (plugins/loading.md, "When auto-update runs")', () => {
  test('refreshes every marketplace with auto-update on and updates the plugins installed from them', () => {
    const plan = planAutoUpdatePass(
      [
        { name: 'on', autoUpdate: true, plugins: [plugin('a@on'), plugin('b@on')] },
        { name: 'off', autoUpdate: false, plugins: [plugin('c@off')] },
      ],
      fakeEnvironment(),
    );
    expect(plan).toEqual({ refresh: ['on'], update: ['a@on', 'b@on'], skipped: [] });
  });

  test('leaves out a headersHelper plugin and lists it; a command source is left to its own re-run', () => {
    const plan = planAutoUpdatePass(
      [
        {
          name: 'on',
          autoUpdate: true,
          plugins: [
            plugin('plain@on'),
            plugin('helper@on', { headersHelper: 'h.sh' }),
            plugin('cmd@on', { commandSource: { accepted: true } }),
          ],
        },
      ],
      fakeEnvironment(),
    );
    expect(plan.update).toEqual(['plain@on']);
    expect(plan.skipped).toEqual([
      { id: 'helper@on', reason: 'headers-helper', listedInErrorsTab: true },
      { id: 'cmd@on', reason: 'command-source', listedInErrorsTab: false },
    ]);
  });

  test('a pass that is off by environment plans nothing', () => {
    const plan = planAutoUpdatePass(
      [{ name: 'on', autoUpdate: true, plugins: [plugin('a@on')] }],
      fakeEnvironment({ DISABLE_UPDATES: '1' }),
    );
    expect(plan).toEqual({ refresh: [], update: [], skipped: [] });
  });

  test('the running session is told, and keeps the versions it loaded', () => {
    expect(pluginUpdatedNotice('formatter')).toBe(
      'Plugin updated: formatter · Run /reload-plugins to apply',
    );
  });
});
