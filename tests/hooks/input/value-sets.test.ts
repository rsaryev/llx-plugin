/**
 * hooks.md § "Notification" (the matcher table of fourteen notification types), § "SessionEnd" (the
 * reason table) and § "InstructionsLoaded input" (`load_reason`): a host must be able to fire every
 * documented value, not the few it happens to raise. Each value goes through the real engine: the
 * hook whose matcher is that value runs and reads the value on stdin, and a hook matching another
 * value does not run. The values of the Notification types are read from the requirement ids of
 * the matcher table (one id per documented type), so a type the docs add fails here.
 */
import { describe, expect, test } from 'bun:test';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { MATCHER_VALUES } from '../../../src/hooks/select/matcher-values.ts';
import { fire } from '../../support/hooks-fire.ts';
import { stage } from '../../support/hooks-output.ts';
import { entry, FACTS } from '../../support/hooks-select.ts';
import { requirementKeys } from '../../support/requirements.ts';
import { spec } from '../../support/spec.ts';

/** What a command hook of `event` with this matcher read on stdin, or `undefined` when it did not run. */
async function ranWith(event: HookEvent, matcher: string, facts: object) {
  const hook = entry(event, { matcher });
  const { runner } = await fire(event, [hook], [{ exitCode: 0 }], {
    output: stage,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the facts are one event's, picked by the caller
    facts: facts as never,
  });
  const stdin = runner.calls[0]?.stdin;
  return stdin === undefined ? undefined : (JSON.parse(stdin) as Record<string, unknown>);
}

const NOTIFICATION_TYPES = requirementKeys('hooks.matcherValue.Notification.');
const KIT_NOTIFICATION_TYPES: readonly string[] = MATCHER_VALUES.Notification;
const KIT_SESSION_END_REASONS: readonly string[] = MATCHER_VALUES.SessionEnd;

spec('hooks.behavior.Notification input', () => {
  test('the documented table has fourteen types, and the kit lists exactly those', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(14);
    expect([...KIT_NOTIFICATION_TYPES].toSorted()).toEqual(NOTIFICATION_TYPES.toSorted());
  });

  test.each(NOTIFICATION_TYPES)(
    'a host can fire %s: the hook matching it reads that type and the others stay silent',
    async (type) => {
      const facts = { ...FACTS.Notification, notification_type: type, message: `about ${type}` };
      const read = await ranWith('Notification', type, facts);
      expect(read).toMatchObject({
        hook_event_name: 'Notification',
        notification_type: type,
        message: `about ${type}`,
      });
      const other = NOTIFICATION_TYPES.find((candidate) => candidate !== type);
      expect(other).toBeDefined();
      expect(await ranWith('Notification', other ?? '', facts)).toBeUndefined();
    },
  );

  test('a hook with no matcher runs for every one of the fourteen types', async () => {
    for (const type of NOTIFICATION_TYPES) {
      const facts = { ...FACTS.Notification, notification_type: type };
      expect(await ranWith('Notification', '', facts)).toMatchObject({ notification_type: type });
    }
  });

  test('a matcher naming several types runs for each of them and for no other', async () => {
    const matcher = 'auth_success|auth_storage_failure';
    for (const type of NOTIFICATION_TYPES) {
      const read = await ranWith('Notification', matcher, {
        ...FACTS.Notification,
        notification_type: type,
      });
      expect(read !== undefined).toBe(type === 'auth_success' || type === 'auth_storage_failure');
    }
  });
});

/** The reasons of the table of hooks.md § "SessionEnd". */
const SESSION_END_REASONS = ['clear', 'resume', 'logout', 'prompt_input_exit', 'other'];

spec('hooks.behavior.SessionEnd input', () => {
  test('the kit lists the five reasons of the table, and not the removed bypass_permissions_disabled', () => {
    expect([...KIT_SESSION_END_REASONS].toSorted()).toEqual(SESSION_END_REASONS.toSorted());
    expect(KIT_SESSION_END_REASONS).not.toContain('bypass_permissions_disabled');
  });

  test.each(SESSION_END_REASONS)(
    'a host can end a session with %s: the hook matching it runs and reads the reason',
    async (reason) => {
      expect(await ranWith('SessionEnd', reason, { reason })).toMatchObject({
        hook_event_name: 'SessionEnd',
        reason,
      });
      const other = SESSION_END_REASONS.find((candidate) => candidate !== reason) ?? '';
      expect(await ranWith('SessionEnd', other, { reason })).toBeUndefined();
    },
  );
});

describe('InstructionsLoaded load reasons, the value set hooks.input.InstructionsLoaded.load_reason proves', () => {
  /** The five of the `load_reason` row, each with the optional field it carries. */
  const LOADS = [
    ['session_start', {}],
    ['nested_traversal', { trigger_file_path: '/p/src/a.ts' }],
    ['path_glob_match', { trigger_file_path: '/p/src/a.ts', globs: ['src/**'] }],
    ['include', { parent_file_path: '/p/CLAUDE.md' }],
    ['compact', {}],
  ] as const;

  test.each(LOADS)(
    'a host can fire %s: the matcher on the reason selects it',
    async (reason, more) => {
      const facts = {
        file_path: '/p/CLAUDE.md',
        memory_type: 'Project',
        load_reason: reason,
        ...more,
      };
      expect(await ranWith('InstructionsLoaded', reason, facts)).toMatchObject({
        hook_event_name: 'InstructionsLoaded',
        load_reason: reason,
        ...more,
      });
      const other = LOADS.find(([candidate]) => candidate !== reason)?.[0] ?? '';
      expect(await ranWith('InstructionsLoaded', other, facts)).toBeUndefined();
    },
  );

  test('the matcher from the docs, path_glob_match|nested_traversal, fires only for lazy loads', async () => {
    const lazy = 'path_glob_match|nested_traversal';
    for (const [reason, more] of LOADS) {
      const read = await ranWith('InstructionsLoaded', lazy, {
        file_path: '/p/CLAUDE.md',
        memory_type: 'Project',
        load_reason: reason,
        ...more,
      });
      expect(read !== undefined).toBe(
        reason === 'path_glob_match' || reason === 'nested_traversal',
      );
    }
  });
});
