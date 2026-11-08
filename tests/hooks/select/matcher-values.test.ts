/**
 * hooks.md, the matcher table of each event section (SessionStart, Setup, Notification, PreCompact,
 * PostCompact, ConfigChange, DirectoryAdded): the values a matcher can name. One
 * `spec(hooks.matcherValue.<Event>.<value>)` per documented value: a hook whose matcher is that
 * value runs when the event carries it, and does not run for any other documented value.
 */
import { describe, expect, test } from 'bun:test';
import { MATCHER_VALUES } from '../../../src/hooks/select/matcher-values.ts';
import type { EventFactsOf } from '../../../src/hooks/contracts.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { spec } from '../../support/spec.ts';
import { entry, FACTS, select } from '../../support/hooks-select.ts';

/** What the docs list for each event, written out here from the section tables. */
const DOCUMENTED = {
  SessionStart: ['startup', 'resume', 'clear', 'compact', 'fork'],
  Setup: ['init', 'maintenance'],
  Notification: [
    'permission_prompt',
    'idle_prompt',
    'auth_success',
    'auth_storage_failure',
    'elicitation_dialog',
    'elicitation_url_dialog',
    'elicitation_complete',
    'elicitation_response',
    'agent_needs_input',
    'agent_completed',
    'quota_auto_resume_fired',
    'quota_auto_resume_stale',
    'quota_auto_resume_disabled',
    'plugin_notification',
  ],
  PreCompact: ['manual', 'auto'],
  PostCompact: ['manual', 'auto'],
  ConfigChange: [
    'user_settings',
    'project_settings',
    'local_settings',
    'policy_settings',
    'skills',
  ],
  DirectoryAdded: ['slash_command', 'register_repo_root'],
} as const;

/** One spec block per documented value of `event`; `carrying` builds facts that hold the value. */
function proveValues<E extends HookEvent, V extends string>(
  event: E,
  values: readonly V[],
  carrying: (value: V) => EventFactsOf<E>,
): void {
  const runs = (matcher: string, value: V): boolean =>
    select([entry(event, { matcher })], event, carrying(value)).selected.length === 1;
  for (const value of values) {
    spec(`hooks.matcherValue.${event}.${value}`, () => {
      test('a hook with this matcher runs when the event carries the value', () => {
        expect(runs(value, value)).toBe(true);
      });
      test('and does not run for any other documented value', () => {
        for (const other of values.filter((each) => each !== value)) {
          expect(runs(value, other)).toBe(false);
        }
      });
    });
  }
}

proveValues('SessionStart', DOCUMENTED.SessionStart, (source) => ({
  ...FACTS.SessionStart,
  source,
}));
proveValues('Setup', DOCUMENTED.Setup, (trigger) => ({ ...FACTS.Setup, trigger }));
proveValues('Notification', DOCUMENTED.Notification, (notification_type) => ({
  ...FACTS.Notification,
  notification_type,
}));
proveValues('PreCompact', DOCUMENTED.PreCompact, (trigger) => ({ ...FACTS.PreCompact, trigger }));
proveValues('PostCompact', DOCUMENTED.PostCompact, (trigger) => ({
  ...FACTS.PostCompact,
  trigger,
}));
proveValues('ConfigChange', DOCUMENTED.ConfigChange, (source) => ({
  ...FACTS.ConfigChange,
  source,
}));
proveValues('DirectoryAdded', DOCUMENTED.DirectoryAdded, (source) => ({
  ...FACTS.DirectoryAdded,
  source,
}));

const VALUED_EVENTS = [
  'SessionStart',
  'Setup',
  'Notification',
  'PreCompact',
  'PostCompact',
  'ConfigChange',
  'DirectoryAdded',
] as const;

describe('the kit lists the documented values', () => {
  test('MATCHER_VALUES holds the documented values of each event', () => {
    for (const event of VALUED_EVENTS) {
      expect([...MATCHER_VALUES[event]]).toEqual([...DOCUMENTED[event]]);
    }
  });

  test('SessionEnd lists its reasons without the removed bypass_permissions_disabled', () => {
    expect([...MATCHER_VALUES.SessionEnd]).toEqual([
      'clear',
      'resume',
      'logout',
      'prompt_input_exit',
      'other',
    ]);
  });

  test('InstructionsLoaded and StopFailure list the values of their tables', () => {
    expect([...MATCHER_VALUES.InstructionsLoaded]).toEqual([
      'session_start',
      'nested_traversal',
      'path_glob_match',
      'include',
      'compact',
    ]);
    expect(MATCHER_VALUES.StopFailure).toContain('cloud_credential_error');
  });
});
