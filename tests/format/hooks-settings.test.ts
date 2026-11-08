/**
 * hooks.md § Configuration (event, matcher group, handlers), § Matcher patterns, § Hook handler
 * fields (every handler type and field); plugins/manifest-reference.md § `hooks` (a hooks file
 * wraps the event map in a top-level "hooks" key, a file with the bare event map "fails to load")
 * and plugins/troubleshooting.md § Failed to load hooks (a file that fails the hooks schema does
 * not load). `readHooksFile` reads and validates; running a handler is the hooks module's.
 */
import { describe, expect, test } from 'bun:test';
import { readHooksFile, readHooksSettings } from '../../src/format/index.ts';
import { HOOK_EVENTS } from '../../src/protocol/hook-events.ts';
import { command, errorsOf, file, plain, warningsOf } from '../support/hooks-read.ts';

/** The example of hooks.md, "Matcher patterns": lint only when Claude writes or edits a file. */
const LINT_EXAMPLE = {
  hooks: {
    PostToolUse: [
      { matcher: 'Edit|Write', hooks: [{ type: 'command', command: '/path/to/lint-check.sh' }] },
    ],
  },
};

describe('the hooks file', () => {
  test('wraps the event map in a top-level "hooks" key and reads as written', () => {
    const result = readHooksFile(LINT_EXAMPLE);
    expect(result.issues).toEqual([]);
    expect(plain(result.hooks)).toEqual(LINT_EXAMPLE.hooks);
  });

  test('a file with only the event map, without the wrapper, fails to load', () => {
    const result = readHooksFile(LINT_EXAMPLE.hooks);
    expect(plain(result.hooks)).toEqual({});
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'hooks' }),
    );
  });

  test('an inline hooks object is the event map itself, with no wrapper', () => {
    const result = readHooksSettings(LINT_EXAMPLE.hooks);
    expect(result.issues).toEqual([]);
    expect(plain(result.hooks)).toEqual(LINT_EXAMPLE.hooks);
  });

  test('a value that is not an object does not load', () => {
    for (const raw of [null, 'hooks', 3, [LINT_EXAMPLE]]) {
      const result = readHooksFile(raw);
      expect(plain(result.hooks)).toEqual({});
      expect(errorsOf(result)).toHaveLength(1);
    }
  });

  test('"hooks" that is not an object fails the schema', () => {
    expect(errorsOf(readHooksFile({ hooks: [] }))).toHaveLength(1);
    expect(errorsOf(readHooksFile({ hooks: 'PreToolUse' }))).toHaveLength(1);
  });

  test('a file that fails the hooks schema loads none of its hooks', () => {
    const result = readHooksFile(
      file({
        PreToolUse: [{ matcher: 'Bash', hooks: [command] }],
        Stop: [{ hooks: [{ type: 'command' }] }],
      }),
    );
    expect(plain(result.hooks)).toEqual({});
    expect(errorsOf(result)).toEqual([
      expect.objectContaining({ path: 'hooks.Stop[0].hooks[0].command' }),
    ]);
  });

  test('an empty file loads no hooks and is not an error', () => {
    expect(readHooksFile({ hooks: {} })).toEqual({ hooks: {}, issues: [] });
  });

  test('"modules" lists mod files, which the mods reader owns: it is not a hooks issue', () => {
    const result = readHooksFile({ modules: ['./register.js'], hooks: LINT_EXAMPLE.hooks });
    expect(result.issues).toEqual([]);
    expect(plain(result.hooks)).toEqual(LINT_EXAMPLE.hooks);
  });
});

describe('events', () => {
  test('every hook event is accepted', () => {
    const hooks = Object.fromEntries(HOOK_EVENTS.map((event) => [event, [{ hooks: [command] }]]));
    const result = readHooksFile(file(hooks));
    expect(result.issues).toEqual([]);
    expect(Object.keys(result.hooks)).toEqual([...HOOK_EVENTS]);
  });

  test('an event is an array of matcher groups', () => {
    for (const group of [{ hooks: [command] }, 'Bash', null]) {
      expect(errorsOf(readHooksFile(file({ PreToolUse: group })))).toHaveLength(1);
    }
  });
});

describe('matcher groups', () => {
  test('{ matcher, hooks }: the matcher is optional, "hooks" is required', () => {
    const result = readHooksFile(file({ Stop: [{ hooks: [command] }] }));
    expect(result.issues).toEqual([]);
    expect(plain(result.hooks.Stop?.[0])).toEqual({ hooks: [command] });
    const missing = readHooksFile(file({ Stop: [{ matcher: 'x' }] }));
    expect(missing.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'hooks.Stop[0].hooks' }),
    );
  });

  test('a matcher that is not a string fails', () => {
    const result = readHooksFile(file({ PreToolUse: [{ matcher: ['Bash'], hooks: [command] }] }));
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'hooks.PreToolUse[0].matcher' }),
    );
  });

  test('a matcher on an event without matcher support is silently ignored', () => {
    const result = readHooksFile(
      file({ UserPromptSubmit: [{ matcher: 'anything', hooks: [command] }] }),
    );
    expect(result.issues).toEqual([]);
  });

  test('every matcher spelling the docs show loads', () => {
    for (const matcher of [
      '*',
      '',
      'Bash',
      'Edit|Write',
      'Edit, Write',
      '^Notebook',
      'mcp__memory__.*',
    ]) {
      const result = readHooksFile(file({ PreToolUse: [{ matcher, hooks: [command] }] }));
      expect(result.issues).toEqual([]);
    }
  });

  test('an unknown group key is dropped with a warning', () => {
    const result = readHooksFile(file({ Stop: [{ hooks: [command], priority: 1 }] }));
    expect(plain(result.hooks.Stop?.[0])).toEqual({ hooks: [command] });
    expect(warningsOf(result)).toHaveLength(1);
  });
});

// The docs are silent on what follows; each is a row in spec/judgments.md.
describe('judgments where the docs are silent', () => {
  test('an event name that is not a hook event is kept, with a warning', () => {
    const result = readHooksFile(file({ PreToolUsee: [{ hooks: [command] }] }));
    expect(plain(result.hooks)).toEqual({ PreToolUsee: [{ hooks: [command] }] });
    expect(warningsOf(result)).toEqual([expect.objectContaining({ path: 'hooks.PreToolUsee' })]);
  });

  test('a matcher that is not a valid regular expression warns that it matches nothing', () => {
    const result = readHooksFile(file({ PreToolUse: [{ matcher: 'Edit(', hooks: [command] }] }));
    expect(errorsOf(result)).toEqual([]);
    expect(warningsOf(result)).toEqual([
      expect.objectContaining({ path: 'hooks.PreToolUse[0].matcher' }),
    ]);
    expect(result.hooks.PreToolUse?.[0]?.matcher).toBe('Edit(');
  });

  test('an empty "command", a non-finite or non-positive timeout fails', () => {
    for (const handler of [
      { type: 'command', command: '' },
      { ...command, timeout: Number.POSITIVE_INFINITY },
    ]) {
      expect(errorsOf(readHooksFile(file({ Stop: [{ hooks: [handler] }] })))).toHaveLength(1);
    }
  });

  test('every problem of a file is reported, not only the first', () => {
    const result = readHooksFile(
      file({ Stop: [{ hooks: [{ type: 'command' }, { type: 'http' }] }] }),
    );
    expect(errorsOf(result).map((found) => found.path)).toEqual([
      'hooks.Stop[0].hooks[0].command',
      'hooks.Stop[0].hooks[1].url',
    ]);
  });
});
