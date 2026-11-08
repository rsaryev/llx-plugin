/**
 * plugins/troubleshooting.md § `"<plugin>" was not installed: it would share its folder with
 * "<other>"`: ids that are the same once `.` and `@` are written as `-` (and, on macOS and Windows,
 * once capitals are folded) map to one folder; the refused plugin's id and an installed plugin's
 * id, or two ids of one install, cannot both be installed. The sentence the section quotes is
 * asserted verbatim; the surrounding words are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { folderCollisions, folderOf } from '../../src/marketplace/folder-collision.ts';

const REFUSED = '"a-b@m" was not installed: it would share its folder with "a.b@m"';

const check = (
  incoming: readonly string[],
  installed: readonly string[],
  platform: 'linux' | 'macos' | 'windows' = 'linux',
) => folderCollisions({ incoming, installed, platform, surface: 'shell' });

// The id of this section holds double quotes, which the SP2 parser of scripts/spec/check.ts splits at,
// so it cannot be named in spec(...): reported as unproven, tested here outside spec().
describe('troubleshooting.md: a plugin that would share its folder with another is refused', () => {
  test('ids that are the same once . and @ are written as - share one folder', () => {
    expect(folderOf('a.b@m', 'linux')).toBe('a-b-m');
    expect(folderOf('a-b@m', 'linux')).toBe(folderOf('a.b@m', 'linux'));
    expect(folderOf('a@b-m', 'linux')).toBe(folderOf('a-b@m', 'linux'));
  });

  test('the refused plugin and an installed one: the line names both, quoted', () => {
    const [collision] = check(['a-b@m'], ['a.b@m']);
    expect(collision?.plugin).toBe('a-b@m');
    expect(collision?.other).toBe('a.b@m');
    expect(collision?.message.startsWith(REFUSED)).toBe(true);
  });

  test('when the other plugin is installed the message says only one of the two can be installed and names the uninstall command', () => {
    const [collision] = check(['a-b@m'], ['a.b@m']);
    expect(collision?.otherInstalled).toBe(true);
    expect(collision?.message).toContain('Only one of the two can be installed.');
    expect(collision?.message).toContain('claude plugin uninstall a.b@m');
  });

  test('in a session the way out is the uninstall step in /plugin', () => {
    const [collision] = folderCollisions({
      incoming: ['a-b@m'],
      installed: ['a.b@m'],
      platform: 'linux',
      surface: 'session',
    });
    expect(collision?.message).toContain('/plugin');
    expect(collision?.message).not.toContain('claude plugin uninstall');
  });

  test('two ids that arrive in one install, such as a plugin and its dependency, collide with no way out', () => {
    const [collision] = check(['a.b@m', 'a-b@m'], []);
    expect(collision?.otherInstalled).toBe(false);
    expect(collision?.plugin).toBe('a-b@m');
    expect(collision?.other).toBe('a.b@m');
    expect(collision?.message).toBe(REFUSED);
    expect(collision?.message).not.toContain('Only one of the two');
  });

  test('ids that differ only in capitals collide on macOS and Windows, not on Linux', () => {
    expect(check(['Fmt@m'], ['fmt@m'], 'macos')).toHaveLength(1);
    expect(check(['Fmt@m'], ['fmt@m'], 'windows')).toHaveLength(1);
    expect(check(['Fmt@m'], ['fmt@m'], 'linux')).toEqual([]);
  });

  test('ids that map to different folders never collide', () => {
    expect(check(['a-b@m', 'c@m'], ['a.c@m', 'a_b@m'])).toEqual([]);
  });

  test('an id that is already installed is not a collision with itself', () => {
    expect(check(['a.b@m'], ['a.b@m'])).toEqual([]);
  });

  test('the installed plugin keeps its files: only the incoming ids are reported', () => {
    const found = check(['x@m', 'a-b@m'], ['a.b@m']);
    expect(found.map((one) => one.plugin)).toEqual(['a-b@m']);
  });
});

describe('judgments (spec/judgments.md, src/marketplace/folder-collision.ts)', () => {
  test('the saved-data line differs from the folder line only in its noun', () => {
    const [collision] = folderCollisions({
      incoming: ['a-b@m'],
      installed: ['a.b@m'],
      platform: 'linux',
      surface: 'shell',
      shares: 'saved data',
    });
    expect(
      collision?.message.startsWith(
        '"a-b@m" was not installed: it would share its saved data with "a.b@m"',
      ),
    ).toBe(true);
  });

  test('of two ids in one install the later one is the one refused', () => {
    expect(check(['a-b@m', 'a.b@m'], [])[0]?.plugin).toBe('a.b@m');
  });
});
