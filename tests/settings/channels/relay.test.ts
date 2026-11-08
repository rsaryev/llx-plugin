/** channels-reference.md § Relay permission prompts: How relay works, Permission request fields. */
import { expect, test } from 'bun:test';
import {
  REQUEST_ID_ALPHABET,
  createPermissionRelay,
  elide,
  inputPreview,
  maskCredentials,
  relayDescription,
  sanitizeRelayText,
} from '../../../src/settings/channels/index.ts';
import { spec } from '../../support/spec.ts';

const sequence = (values: readonly number[]) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
};
const bash = { toolName: 'Bash', description: 'List files', input: { command: 'ls' } };

spec(
  ['channels.reference.How relay works', 'channels.reference.Permission request fields.request_id'],
  () => {
    test('an id is five lowercase letters, never l', () => {
      const relay = createPermissionRelay(Math.random);
      for (let index = 0; index < 200; index += 1) {
        expect(relay.open(bash).request_id).toMatch(/^[a-km-z]{5}$/);
      }
      expect(REQUEST_ID_ALPHABET).toHaveLength(25);
    });
    test('a verdict is applied only when its id matches an open request', () => {
      const relay = createPermissionRelay(sequence([0, 0.5, 0.9]));
      const { request_id } = relay.open(bash);
      expect(relay.verdict({ request_id: 'zzzzz', behavior: 'allow' })).toEqual({ applied: false });
      expect(relay.verdict({ request_id, behavior: 'allow' })).toEqual({
        applied: true,
        behavior: 'allow',
      });
      expect(relay.verdict({ request_id, behavior: 'deny' })).toEqual({ applied: false });
    });
    test('a local answer drops the pending remote request', () => {
      const relay = createPermissionRelay(Math.random);
      const { request_id } = relay.open(bash);
      relay.answerLocally(request_id);
      expect(relay.verdict({ request_id, behavior: 'allow' })).toEqual({ applied: false });
    });
    test('once an id repeats, a verdict carrying it is dropped', () => {
      const relay = createPermissionRelay(() => 0);
      const first = relay.open(bash);
      const second = relay.open(bash);
      expect(second.request_id).toBe(first.request_id);
      expect(relay.verdict({ request_id: first.request_id, behavior: 'allow' })).toEqual({
        applied: false,
      });
    });
    test('deny is applied as deny', () => {
      const relay = createPermissionRelay(Math.random);
      const { request_id } = relay.open(bash);
      expect(relay.verdict({ request_id, behavior: 'deny' })).toEqual({
        applied: true,
        behavior: 'deny',
      });
    });
  },
);

spec('channels.reference.Permission request fields', () => {
  test('a request carries the four string fields', () => {
    const params = createPermissionRelay(Math.random).open(bash);
    expect(Object.keys(params).toSorted()).toEqual([
      'description',
      'input_preview',
      'request_id',
      'tool_name',
    ]);
  });
});

spec('channels.reference.Permission request fields.tool_name', () => {
  test('tool_name is the tool Claude wants to use', () => {
    expect(createPermissionRelay(Math.random).open(bash).tool_name).toBe('Bash');
  });
});

spec('channels.reference.Permission request fields.description', () => {
  test('a described call relays the description, never the command', () => {
    expect(relayDescription('List files')).toBe('List files');
  });
  test('with no description the field is the constant', () => {
    expect(relayDescription(undefined)).toBe('Run shell command');
    expect(relayDescription('  ')).toBe('Run shell command');
  });
  test('it is sanitized: direction overrides neutralized, whitespace folded', () => {
    expect(relayDescription('a\u202Eb \n\t c')).toBe('a\uFFFDb c');
  });
  test('credentials are masked', () => {
    expect(relayDescription('use ghp_abcdefghijklmnopqrstuvwxyz0123 now')).toBe(
      'use [REDACTED] now',
    );
  });
});

spec('channels.reference.Permission request fields.input_preview', () => {
  test('the arguments show as JSON-shaped text keyed per top-level field', () => {
    expect(inputPreview({ command: 'ls -la', n: 2 })).toBe('{"command": "ls -la", "n": 2}');
  });
  test('a long value keeps its start and end around a counted marker', () => {
    const value = `${'a'.repeat(2000)}${'b'.repeat(2000)}`;
    const text = elide(value);
    expect(text).toContain('⋯ 500 code points elided ⋯');
    expect(text.startsWith('a'.repeat(1750))).toBe(true);
    expect(text.endsWith('b'.repeat(1750))).toBe(true);
    expect(elide('x'.repeat(3500))).toHaveLength(3500);
  });
  test('the limit applies to each top-level field separately', () => {
    const preview = inputPreview({ one: 'x'.repeat(3000), two: 'y'.repeat(3000) });
    expect(preview).not.toContain('elided');
  });
  test('code points, not UTF-16 units, are counted', () => {
    expect(elide('😀'.repeat(3500))).toBe('😀'.repeat(3500));
  });
  test('a value that cannot be serialized shows the marker and keeps its key', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(inputPreview({ ok: 'x', bad: circular })).toBe(
      '{"ok": "x", "bad": (value unserializable)}',
    );
    expect(inputPreview({ big: 1n })).toBe('{"big": (value unserializable)}');
  });
  test('credential values and key names are masked; paths and URLs are not', () => {
    const token = 'sk-ant-abcdefghijklmnop';
    expect(inputPreview({ key: token })).toBe('{"key": "[REDACTED]"}');
    expect(inputPreview({ [token]: 1 })).toBe('{"[REDACTED]": 1}');
    expect(maskCredentials('/tmp/sk-abcdefghijklmnopqrstuvwxyz')).toBe(
      '/tmp/sk-abcdefghijklmnopqrstuvwxyz',
    );
    expect(sanitizeRelayText('https://x.test/ghp_abcdefghijklmnopqrstuvwxyz01')).toContain(
      'https://',
    );
  });
});
