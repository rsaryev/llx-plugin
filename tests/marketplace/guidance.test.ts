/**
 * plugins/anthropic-marketplaces.md § Deprecated `claude-code-plugins` marketplace; plugins/troubleshooting.md
 * § Plugin doesn't appear or its skills don't show up.
 */
import { expect, test } from 'bun:test';
import {
  SKIPPED_TUTORIAL_STEP,
  deprecatedPluginAdvice,
  officialInstallCommand,
} from '../../src/marketplace/deprecated-marketplace.ts';
import {
  nextStep,
  type MissingPluginFacts,
} from '../../src/marketplace/missing-plugin-diagnosis.ts';
import { spec } from '../support/spec.ts';

spec('marketplace.anthropic.Deprecated claude-code-plugins marketplace', () => {
  test('a plugin is installed from claude-plugins-official, and the tutorial step that adds anthropics/claude-code is skipped', () => {
    expect(officialInstallCommand('commit-commands')).toBe(
      'claude plugin install commit-commands@claude-plugins-official',
    );
    expect(SKIPPED_TUTORIAL_STEP).toBe('/plugin marketplace add anthropics/claude-code');
  });
  test('ralph-wiggum is now ralph-loop, with commands starting /ralph-loop:', () => {
    expect(deprecatedPluginAdvice('ralph-wiggum')).toEqual({
      change: 'renamed',
      command: 'claude plugin install ralph-loop@claude-plugins-official',
      commandPrefix: '/ralph-loop:',
    });
  });
  test('claude-opus-4-5-migration is retired: uninstall it from claude-code-plugins', () => {
    expect(deprecatedPluginAdvice('claude-opus-4-5-migration')).toEqual({
      change: 'retired',
      command: 'claude plugin uninstall claude-opus-4-5-migration@claude-code-plugins',
    });
  });
  test('any other plugin is left as it is', () => {
    expect(deprecatedPluginAdvice('code-review')).toBeUndefined();
    expect(deprecatedPluginAdvice('toString')).toBeUndefined();
  });
});

const facts = (extra: Partial<MissingPluginFacts> = {}): MissingPluginFacts => ({
  installed: true,
  enabled: true,
  errors: [],
  installedThisSession: false,
  ownPlugin: false,
  ...extra,
});

spec("install.troubleshooting.Plugin doesn't appear or its skills don't show up", () => {
  test('first confirm it is installed and enabled', () => {
    expect(nextStep(facts({ installed: false })).step).toBe('confirm-installed-and-enabled');
    expect(nextStep(facts({ enabled: false })).step).toBe('confirm-installed-and-enabled');
  });
  test('then read the Errors tab', () => {
    expect(nextStep(facts({ errors: ['Plugin "x" not cached at /p'] }))).toEqual({
      step: 'read-errors-tab',
      errors: ['Plugin "x" not cached at /p'],
    });
  });
  test('an install during this session needs /reload-plugins', () => {
    expect(nextStep(facts({ installedThisSession: true }))).toEqual({
      step: 'reload',
      command: '/reload-plugins',
    });
  });
  test('a plugin that loads with no error depends on whose it is', () => {
    expect(nextStep(facts({ ownPlugin: true })).step).toBe('own-plugin');
    expect(nextStep(facts()).step).toBe('someone-elses-plugin');
  });
});
