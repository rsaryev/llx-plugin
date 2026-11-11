/**
 * The configuration directory (`src/format/config-directory.ts`), the one owner of `CLAUDE_CONFIG_DIR`
 * (env-vars.md: "Override the configuration directory (default: `~/.claude`)"; claude-directory.md:
 * "every `~/.claude` path on this page lives under that directory instead. The same applies to
 * `.claude.json`"). An empty value counting as unset is a judgment (spec/judgments.md). A `~` stays
 * as typed (env-vars.md, "In settings files": "shorthand such as `~` or `$HOME` stays as typed"); a
 * value of only spaces is set, not trimmed (judgment, spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import {
  configDirectoryOf,
  configFolderOf,
  globalConfigFileOf,
} from '../../src/format/config-directory.ts';

const join = (base: string, relative: string) => `${base}/${relative}`;
const HOME = '/home/me';

describe('the configuration directory', () => {
  test('unset, ~/.claude and ~/.claude.json', () => {
    expect(configDirectoryOf(HOME, undefined, join)).toBe('/home/me/.claude');
    expect(configFolderOf(HOME, undefined)).toEqual({ base: HOME, folder: '.claude' });
    expect(globalConfigFileOf(HOME, undefined, join)).toBe('/home/me/.claude.json');
  });

  test('set, the directory itself, and .claude.json inside it', () => {
    expect(configDirectoryOf(HOME, '/cfg', join)).toBe('/cfg');
    expect(configFolderOf(HOME, '/cfg')).toEqual({ base: '/cfg', folder: '' });
    expect(globalConfigFileOf(HOME, '/cfg', join)).toBe('/cfg/.claude.json');
  });

  test('empty counts as unset (spec/judgments.md)', () => {
    expect(configDirectoryOf(HOME, '', join)).toBe('/home/me/.claude');
    expect(configFolderOf(HOME, '')).toEqual({ base: HOME, folder: '.claude' });
    expect(globalConfigFileOf(HOME, '', join)).toBe('/home/me/.claude.json');
  });

  test('a value is taken as given: a `~` is not expanded and spaces are not trimmed', () => {
    expect(configDirectoryOf(HOME, '~/.claude-work', join)).toBe('~/.claude-work');
    expect(globalConfigFileOf(HOME, '~/.claude-work', join)).toBe('~/.claude-work/.claude.json');
    expect(configDirectoryOf(HOME, ' ', join)).toBe(' ');
  });
});
