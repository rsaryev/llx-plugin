/**
 * Judgments of `marketplace-names.ts` (spec/judgments.md): where the docs give examples of what
 * impersonates an official marketplace, or do not quote a message, the kit decides. None of this
 * counts as compatibility, so nothing here is under `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  downloadFolderIssues,
  loadNameIssues,
  spellingOf,
  validationNameIssues,
} from '../../../src/format/marketplace/marketplace-names.ts';

const messages = (issues: readonly { readonly message: string }[]): string[] =>
  issues.map((found) => found.message);

const impersonates = (name: string): boolean =>
  messages(validationNameIssues(name)).some((message) => message.includes('impersonates'));

describe('judgment: where the docs name examples, not the rule (spec/judgments.md)', () => {
  test('"official" beside claude, anthropic or anthropics, in either order and with any separators', () => {
    for (const name of [
      'official-claude',
      'claude-official',
      'my.anthropic.official.tools',
      'Official_Anthropic'.replace('_', '-'),
    ]) {
      expect(impersonates(name)).toBe(true);
    }
    expect(impersonates('official-tools')).toBe(false);
  });

  test('a brand word first, then marketplace, plugins, official or directory', () => {
    for (const name of [
      'claude-marketplace',
      'anthropic-plugin',
      'anthropics-official-hub',
      'claude.plugins',
    ]) {
      expect(impersonates(name)).toBe(true);
    }
  });

  test('an official name with more after it reads as one of them; with the words in the middle of another name it does not', () => {
    expect(impersonates('claude-code-marketplace-v2')).toBe(true);
    expect(impersonates('Claude-Plugins-Official')).toBe(true);
    expect(impersonates('my-agent-skills')).toBe(false);
    expect(impersonates('acme-claude-tools')).toBe(false);
  });

  test('an underscore is not a separator: claude_code_plugins is neither a spelling nor an impersonation', () => {
    expect(spellingOf('claude_code_plugins')).toBeUndefined();
    expect(impersonates('claude_code_plugins')).toBe(false);
  });

  test('a spelling of a reserved name is reported as that spelling, not also as impersonation', () => {
    expect(impersonates('claude.code.plugins')).toBe(false);
    expect(loadNameIssues('claude.code.plugins')).toHaveLength(1);
  });

  test('the reserved-name purposes the docs do not quote for builtin, skills-dir, synced and claude-plugin-test follow the doc list', () => {
    expect(messages(validationNameIssues('builtin'))).toEqual([
      'Marketplace name "builtin" is reserved for built-in plugins',
    ]);
    expect(messages(validationNameIssues('skills-dir'))).toEqual([
      'Marketplace name "skills-dir" is reserved for plugins auto-loaded from .claude/skills/',
    ]);
    expect(messages(validationNameIssues('synced'))).toEqual([
      'Marketplace name "synced" is reserved for plugins synced from your claude.ai account',
    ]);
  });

  test('the download-folder clash names the marketplace that owns the folder', () => {
    const registered = [
      { name: 'x-tools', source: { kind: 'github', repo: 'acme/x-tools', path: 'm.json' } },
    ] as const;
    expect(messages(downloadFolderIssues('acme-x-tools', registered))).toEqual([
      `Can't use the marketplace name "acme-x-tools": it is the download folder of the registered marketplace "x-tools"`,
    ]);
  });
});
