/**
 * marketplace-reference.md § Plugin sources (the table row "Relative path"), § Relative path
 * plugin source, § Bare names under pluginRoot, § Top-level fields (`metadata.pluginRoot`),
 * § Validation messages (the `plugins[i].source` rows).
 */
import { describe, expect, test } from 'bun:test';
import { parsePluginSource } from '../../../src/format/marketplace/plugin-source.ts';
import { slotAt } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const PATH = 'plugins[0].source';

const parse = (raw: unknown, pluginRoot?: string, platform?: 'posix' | 'windows') =>
  parsePluginSource(raw, {
    ...slotAt(0, pluginRoot === undefined ? {} : { pluginRoot }),
    context: platform === undefined ? {} : { platform },
  });

const messages = (raw: unknown, pluginRoot?: string, platform?: 'posix' | 'windows') =>
  parse(raw, pluginRoot, platform).issues.map((found) => [
    found.severity,
    found.path,
    found.message,
  ]);

spec('marketplace.source.Relative path', () => {
  test('"./plugins/formatter" is the directory plugins/formatter below the marketplace root', () => {
    expect(parse('./plugins/formatter')).toEqual({
      source: { kind: 'relative', path: 'plugins/formatter', bare: false },
      issues: [],
    });
  });

  test('"." on its own, and "./", mean the root itself', () => {
    for (const root of ['.', './']) {
      expect(parse(root).source).toEqual({ kind: 'relative', path: '.', bare: false });
    }
  });

  test('a path that does not start with "./" fails with the quoted message', () => {
    expect(messages('plugins/formatter')).toEqual([
      ['error', PATH, 'Invalid string: must start with "./"'],
    ]);
    expect(parse('plugins/formatter').source).toBeUndefined();
  });

  test('a path containing ".." fails validation, naming the path', () => {
    for (const raw of ['./../outside', '../outside', './plugins/../../x']) {
      expect(messages(raw)).toEqual([['error', PATH, `Path contains "..": ${raw}`]]);
    }
  });

  test('on macOS and Linux a backslash anywhere after the leading "./" is refused with the judged wording', () => {
    for (const raw of ['./plugins\\formatter', './a\\', './\\a']) {
      expect(messages(raw, undefined, 'posix')).toEqual([
        ['error', PATH, `Path contains a backslash: ${raw}. Write the path with forward slashes`],
      ]);
      expect(parse(raw, undefined, 'posix').source).toBeUndefined();
    }
    expect(parse('./plugins\\formatter').source).toBeUndefined();
  });

  test('on Windows a backslash is accepted and the path is kept with "/" separators', () => {
    expect(parse('./plugins\\formatter', undefined, 'windows').source).toEqual({
      kind: 'relative',
      path: 'plugins/formatter',
      bare: false,
    });
  });

  test('a source that is neither a string nor an object is Invalid input', () => {
    for (const raw of [3, null, true, ['./a']]) {
      expect(messages(raw)).toEqual([['error', PATH, 'Invalid input']]);
    }
  });
});

spec('marketplace.field.metadata.pluginRoot', () => {
  test('with pluginRoot "./plugins", the bare name "formatter" is ./plugins/formatter', () => {
    expect(parse('formatter', './plugins')).toEqual({
      source: { kind: 'relative', path: 'plugins/formatter', bare: true },
      issues: [],
    });
  });

  test('without pluginRoot a bare name is not a source', () => {
    expect(messages('formatter')).toEqual([
      ['error', PATH, 'Invalid string: must start with "./"'],
    ]);
  });

  test('pluginRoot has no effect on a source that already starts with "./"', () => {
    expect(parse('./formatter', './plugins').source).toEqual({
      kind: 'relative',
      path: 'formatter',
      bare: false,
    });
  });

  test('"team-a/formatter" holds a "/", is not a bare name, and still needs "./"', () => {
    expect(messages('team-a/formatter', './plugins')).toEqual([
      ['error', PATH, 'Invalid string: must start with "./"'],
    ]);
  });

  test('pluginRoot must itself be a relative path inside the marketplace', () => {
    for (const root of ['../plugins', './a/../../b', '/plugins', 'C:/plugins', '']) {
      const result = parse('formatter', root);
      expect(result.source).toBeUndefined();
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.severity).toBe('error');
      expect(result.issues[0]?.path).toBe(PATH);
      expect(result.issues[0]?.message).toContain('metadata.pluginRoot');
    }
  });

  test('"." as the pluginRoot is the marketplace root itself', () => {
    expect(parse('formatter', '.').source).toEqual({
      kind: 'relative',
      path: 'formatter',
      bare: true,
    });
  });
});

describe('judgments: relative paths', () => {
  test('a pluginRoot written without "./" and with a trailing slash is the same directory', () => {
    for (const root of ['plugins', './plugins/', 'plugins/']) {
      expect(parse('formatter', root).source).toEqual({
        kind: 'relative',
        path: 'plugins/formatter',
        bare: true,
      });
    }
  });

  test('a trailing slash on a path is dropped', () => {
    expect(parse('./plugins/formatter/').source).toMatchObject({ path: 'plugins/formatter' });
  });

  test('".." anywhere in the text counts, as "contains" reads (a name with ".." inside is refused too)', () => {
    expect(parse('./v1..2').source).toBeUndefined();
  });

  test('an empty string is a string that does not start with "./"', () => {
    expect(messages('')).toEqual([['error', PATH, 'Invalid string: must start with "./"']]);
  });
});
