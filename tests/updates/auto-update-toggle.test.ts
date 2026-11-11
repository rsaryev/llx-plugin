/**
 * plugins/install.md § Turn auto-update on or off for a marketplace (the toggle under `/plugin`
 * **Marketplaces**, which writes `known_marketplaces.json` and the settings entry that also declares
 * the marketplace) and plugins/org.md § Turn auto-update on or off per marketplace (a managed entry
 * that sets `autoUpdate` refuses the toggle with `Auto-update for '<name>' is set by`; one that leaves
 * it unset keeps the user toggle).
 */
import { expect, test } from 'bun:test';
import {
  marketplaceAutoUpdate,
  toggleDecision,
  toggleLabel,
  type AutoUpdateFacts,
} from '../../src/updates/auto-update-precedence.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const facts = (name: string, rest: Omit<AutoUpdateFacts, 'name'> = {}): AutoUpdateFacts => ({
  name,
  ...rest,
});

spec('updates.guide.Turn auto-update on or off for a marketplace', () => {
  test('the Marketplaces tab offers Enable auto-update when it is off and Disable auto-update when it is on', () => {
    // off by default, on once the toggle recorded it, and the settings entry that wins either way
    expect(toggleLabel(facts('acme'))).toBe('Enable auto-update');
    expect(toggleLabel(facts('acme', { recorded: true }))).toBe('Disable auto-update');
    expect(toggleLabel(facts('acme', { recorded: true, settingsEntry: false }))).toBe(
      'Enable auto-update',
    );
    expect(toggleLabel(facts('acme', { recorded: false, settingsEntry: true }))).toBe(
      'Disable auto-update',
    );
    expect(toggleLabel(facts('claude-plugins-official'))).toBe('Disable auto-update');
  });

  test('choosing it writes autoUpdate to known_marketplaces.json', () => {
    const env = fakeEnvironment();
    expect(toggleDecision({ name: 'acme', enable: true, env })).toEqual({
      outcome: 'write',
      autoUpdate: true,
      writes: [{ file: 'known_marketplaces.json' }],
    });
    expect(toggleDecision({ name: 'acme', enable: false, env })).toEqual({
      outcome: 'write',
      autoUpdate: false,
      writes: [{ file: 'known_marketplaces.json' }],
    });
  });

  test('when a settings file also declares the marketplace, the toggle writes autoUpdate to that entry as well', () => {
    const env = fakeEnvironment();
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(toggleDecision({ name: 'acme', enable: false, env, declared: { scope } })).toEqual({
        outcome: 'write',
        autoUpdate: false,
        writes: [{ file: 'known_marketplaces.json' }, { file: 'settings', scope }],
      });
    }
  });
});

spec('updates.org.Turn auto-update on or off per marketplace', () => {
  const env = fakeEnvironment();

  test('a managed entry that sets autoUpdate refuses the toggle: "Auto-update for \'<name>\' is set by"', () => {
    for (const autoUpdate of [true, false]) {
      const decision = toggleDecision({
        name: 'acme',
        enable: !autoUpdate,
        env,
        declared: { scope: 'managed', autoUpdate },
      });
      expect(decision).toMatchObject({
        outcome: 'refused',
        issue: { severity: 'error', path: 'extraKnownMarketplaces.acme.autoUpdate' },
      });
      expect(decision.outcome === 'refused' && decision.issue.message).toStartWith(
        "Auto-update for 'acme' is set by",
      );
    }
  });

  test('a managed entry that leaves the field unset keeps the user toggle', () => {
    expect(
      toggleDecision({ name: 'acme', enable: true, env, declared: { scope: 'managed' } }),
    ).toEqual({
      outcome: 'write',
      autoUpdate: true,
      writes: [{ file: 'known_marketplaces.json' }],
    });
    // and the persisted choice then decides, since the managed entry sets nothing
    expect(marketplaceAutoUpdate(facts('acme', { recorded: true }))).toBe(true);
  });

  test('a managed autoUpdate of true or false decides for the fleet over what the user recorded', () => {
    expect(marketplaceAutoUpdate(facts('acme', { settingsEntry: false, recorded: true }))).toBe(
      false,
    );
    expect(marketplaceAutoUpdate(facts('acme', { settingsEntry: true, recorded: false }))).toBe(
      true,
    );
  });
});
