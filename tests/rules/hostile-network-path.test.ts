/**
 * permissions.md § Network paths, hostile spellings: a path that resolves to `/net/...` is a network
 * path however it is spelled (`../../net/x`, `/work/../net/x`).
 */
import { expect, test } from 'bun:test';
import { onPath, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('permissions.behavior.Network paths.macOS and Linux', () => {
  test('a relative or dotted spelling of a /net path prompts even with an allow rule', () => {
    const rules = rulesOf(['allow', 'Read(//net/**)'], ['allow', 'Read(//**)']);
    for (const path of [
      '../../net/fs/notes.txt',
      '/work/../net/fs/x',
      '//net/fs/x',
      '/net/./fs/x',
    ]) {
      expect({ path, outcome: onPath('default', 'Read', path, { rules }).outcome }).toEqual({
        path,
        outcome: 'ask',
      });
    }
  });
});
