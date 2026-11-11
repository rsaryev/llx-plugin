/**
 * hooks.md, the "<Event> input" section of ConfigChange, CwdChanged, PostCompact, PreCompact,
 * SessionEnd and Setup. Each section gives the input as a JSON example and names the fields the
 * event adds to the common ones. One `spec(...)` block per event: the input the kit builds for the
 * documented facts is the documented JSON, an optional field is absent when not given, and a wrong
 * type or a value outside the documented set is refused with an error naming the field.
 */
import { expect, test } from 'bun:test';
import { builtFromExample, builtInput } from '../../support/hooks-doc-input.ts';
import { spec } from '../../support/spec.ts';

const TRANSCRIPT = '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl';
const head = { session_id: 'abc123', transcript_path: TRANSCRIPT, cwd: '/Users/me' };

spec('hooks.behavior.ConfigChange input', () => {
  const example = {
    ...head,
    hook_event_name: 'ConfigChange',
    source: 'project_settings',
    file_path: '/Users/me/my-project/.claude/settings.json',
  };

  test('the documented example: source and file_path follow the common fields', () => {
    expect(builtFromExample('ConfigChange', example).wire).toEqual(example);
  });

  test('file_path is optional: a change with no specific file arrives without it', () => {
    const { file_path: _omitted, ...without } = example;
    const { wire } = builtFromExample('ConfigChange', without);
    expect(wire).toEqual(without);
    expect(wire).not.toHaveProperty('file_path');
  });

  test.each(['user_settings', 'project_settings', 'local_settings', 'policy_settings', 'skills'])(
    'the source %s, one of the five the matcher table lists, is accepted',
    (source) => {
      expect(builtInput('ConfigChange', { source }).wire?.['source']).toBe(source);
    },
  );

  test('a source the table does not list is refused, naming the field', () => {
    const refused = builtInput('ConfigChange', { source: 'plugin_settings' });
    expect(refused.wire).toBeUndefined();
    expect(refused.errors).toEqual(['hooks.ConfigChange.input.source']);
  });

  test('the section has no permission_mode: a session in a mode does not add one', () => {
    const { wire } = builtInput('ConfigChange', { source: 'skills' }, { permissionMode: 'plan' });
    expect(wire).not.toHaveProperty('permission_mode');
  });
});

spec('hooks.behavior.CwdChanged input', () => {
  const example = {
    session_id: 'abc123',
    transcript_path: '/Users/me/.claude/projects/p/transcript.jsonl',
    cwd: '/Users/my-project/src',
    hook_event_name: 'CwdChanged',
    old_cwd: '/Users/my-project',
    new_cwd: '/Users/my-project/src',
  };

  test('the documented example: old_cwd and new_cwd follow the common fields', () => {
    expect(builtFromExample('CwdChanged', example).wire).toEqual(example);
  });

  test.each(['old_cwd', 'new_cwd'])('without %s there is no input', (field) => {
    const facts: Record<string, unknown> = { old_cwd: '/a', new_cwd: '/b' };
    delete facts[field];
    const refused = builtInput('CwdChanged', facts);
    expect(refused.wire).toBeUndefined();
    expect(refused.errors).toEqual([`hooks.CwdChanged.input.${field}`]);
  });

  test('a path that is not a string is refused', () => {
    expect(builtInput('CwdChanged', { old_cwd: '/a', new_cwd: 3 }).errors).toEqual([
      'hooks.CwdChanged.input.new_cwd',
    ]);
  });
});

spec('hooks.behavior.PostCompact input', () => {
  const example = {
    ...head,
    hook_event_name: 'PostCompact',
    trigger: 'manual',
    compact_summary: 'Summary of the compacted conversation...',
  };

  test('the documented example', () => {
    expect(builtFromExample('PostCompact', example).wire).toEqual(example);
  });

  test('trigger is manual or auto, and the summary is required', () => {
    expect(builtInput('PostCompact', { trigger: 'auto', compact_summary: 's' }).wire).toBeDefined();
    expect(builtInput('PostCompact', { trigger: 'idle', compact_summary: 's' }).errors).toEqual([
      'hooks.PostCompact.input.trigger',
    ]);
    expect(builtInput('PostCompact', { trigger: 'manual' }).errors).toEqual([
      'hooks.PostCompact.input.compact_summary',
    ]);
  });
});

spec('hooks.behavior.PreCompact input', () => {
  const example = {
    ...head,
    hook_event_name: 'PreCompact',
    trigger: 'manual',
    custom_instructions: null,
  };

  test('the documented example: a manual /compact with nothing passed has custom_instructions null', () => {
    expect(builtFromExample('PreCompact', example).wire).toEqual(example);
  });

  test('a manual compact carries what the user passed to /compact', () => {
    const { wire } = builtInput('PreCompact', {
      trigger: 'manual',
      custom_instructions: 'keep the API notes',
    });
    expect(wire?.['custom_instructions']).toBe('keep the API notes');
  });

  test('an auto compact has custom_instructions null', () => {
    expect(
      builtInput('PreCompact', { trigger: 'auto', custom_instructions: null }).wire?.[
        'custom_instructions'
      ],
    ).toBeNull();
  });

  test('custom_instructions is never absent: the docs say null, not missing', () => {
    expect(builtInput('PreCompact', { trigger: 'auto' }).errors).toEqual([
      'hooks.PreCompact.input.custom_instructions',
    ]);
  });

  test('a trigger other than manual and auto is refused', () => {
    expect(builtInput('PreCompact', { trigger: 'idle', custom_instructions: null }).errors).toEqual(
      ['hooks.PreCompact.input.trigger'],
    );
  });
});

spec('hooks.behavior.SessionEnd input', () => {
  const example = { ...head, hook_event_name: 'SessionEnd', reason: 'other' };

  test('the documented example', () => {
    expect(builtFromExample('SessionEnd', example).wire).toEqual(example);
  });

  test.each(['clear', 'resume', 'logout', 'prompt_input_exit', 'other'])(
    'the reason %s from the reason table arrives',
    (reason) => {
      expect(builtInput('SessionEnd', { reason }).wire?.['reason']).toBe(reason);
    },
  );

  test('bypass_permissions_disabled, removed in v2.1.234, is not a reason Claude Code sends', () => {
    const refused = builtInput('SessionEnd', { reason: 'bypass_permissions_disabled' });
    expect(refused.wire).toBeUndefined();
    expect(refused.errors).toEqual(['hooks.SessionEnd.input.reason']);
  });

  test('the reason is required', () => {
    expect(builtInput('SessionEnd', {}).errors).toEqual(['hooks.SessionEnd.input.reason']);
  });
});

spec('hooks.behavior.Setup input', () => {
  const example = {
    session_id: 'abc123',
    transcript_path: '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl',
    cwd: '/Users/me',
    hook_event_name: 'Setup',
    trigger: 'init',
  };

  test('the documented example: a trigger of init', () => {
    expect(builtFromExample('Setup', example).wire).toEqual(example);
  });

  test('the other trigger is maintenance', () => {
    expect(builtInput('Setup', { trigger: 'maintenance' }).wire?.['trigger']).toBe('maintenance');
  });

  test('a trigger that names neither flag is refused', () => {
    expect(builtInput('Setup', { trigger: 'startup' }).errors).toEqual([
      'hooks.Setup.input.trigger',
    ]);
  });
});
