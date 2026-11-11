/**
 * `registerHooks` (hooks.md, "Configuration"; plugins/components.md, "Hooks"): a hooks file, in
 * the shape of the `hooks` key of settings, becomes the handlers a registry holds, each with the
 * matcher of its group and the place it was declared. Integration of the kit's own seam, outside
 * `spec()`: the docs describe the file, not the registry the kit builds from it.
 */
import { describe, expect, test } from 'bun:test';
import { createHookRegistry } from '../../src/hooks/index.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { pluginSource } from '../support/hooks-select.ts';
import { registerHooks } from '../../src/hooks/register.ts';

const HOOKS: HooksSettings = {
  PreToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [
        { type: 'command', command: './a.sh', if: 'Bash(git *)' },
        { type: 'http', url: 'https://hooks.example/audit' },
      ],
    },
    { hooks: [{ type: 'command', command: './b.sh' }] },
  ],
  Stop: [{ hooks: [{ type: 'command', command: './done.sh' }] }],
};

describe('registerHooks', () => {
  const entries = registerHooks(HOOKS, {
    idPrefix: 'fmt@acme',
    source: pluginSource('fmt'),
    pluginId: 'fmt@acme',
  });

  test('registers one entry per handler, in file order, with its group matcher', () => {
    expect(entries.map((entry) => [entry.event, entry.matcher, entry.handler.type])).toEqual([
      ['PreToolUse', 'Write|Edit', 'command'],
      ['PreToolUse', 'Write|Edit', 'http'],
      ['PreToolUse', undefined, 'command'],
      ['Stop', undefined, 'command'],
    ]);
  });

  test('keeps the official handler untouched, `if` included', () => {
    expect(entries[0]?.handler).toEqual({ type: 'command', command: './a.sh', if: 'Bash(git *)' });
  });

  test('stamps the source and the plugin id on every entry', () => {
    for (const entry of entries) {
      expect(entry.source).toEqual(pluginSource('fmt'));
      expect(entry.pluginId).toBe('fmt@acme');
    }
  });

  test('gives every entry its own stable id, so a session can remove one', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      registerHooks(HOOKS, { idPrefix: 'fmt@acme', source: pluginSource('fmt') }),
    ).toHaveLength(4);
    expect(createHookRegistry(entries).without([ids[0] ?? '']).entries).toHaveLength(3);
  });

  test("leaves `pluginId` off an entry that is not a plugin's", () => {
    const [first] = registerHooks(HOOKS, { idPrefix: 's', source: pluginSource('x') });
    expect(first && 'pluginId' in first).toBe(false);
  });

  test('an empty file registers nothing', () => {
    expect(registerHooks({}, { idPrefix: 'p', source: pluginSource() })).toEqual([]);
  });
});

describe('registerHooks, a key that is no event', () => {
  test('registers nothing for it', () => {
    const hooks: HooksSettings = { NoSuchEvent: [{ hooks: [{ type: 'command', command: 'x' }] }] };
    expect(registerHooks(hooks, { idPrefix: 'p', source: pluginSource() })).toEqual([]);
  });
});
