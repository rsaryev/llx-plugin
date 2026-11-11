/**
 * Host release numbers (`src/format/versions.ts`), the one comparison every "since v2.1.N" rule
 * uses. Judgment (spec/judgments.md): a leading `v`, surrounding blanks and trailing text after
 * the number are tolerated; a pre-release (`2.1.310-beta.1`) sorts before its release, as in
 * semver; a text with no leading `major.minor.patch` is no version.
 */
import { expect, test } from 'bun:test';
import { compareVersions, versionAtLeast } from '../../src/format/versions.ts';

test('dotted numbers compare part by part', () => {
  expect(versionAtLeast('2.1.1000', '2.1.304')).toBe(true);
  expect(versionAtLeast('2.1.99', '2.1.304')).toBe(false);
  expect(versionAtLeast('3.0.0', '2.9.9')).toBe(true);
  expect(compareVersions('2.1.304', '2.1.304')).toBe(0);
});

test('a leading v, blanks and trailing text are tolerated', () => {
  expect(versionAtLeast('v2.1.304', '2.1.304')).toBe(true);
  expect(versionAtLeast(' 2.1.320 (Claude Code)', 'v2.1.310')).toBe(true);
});

test('a pre-release sorts before its release and after the one before', () => {
  expect(versionAtLeast('2.1.310-beta.1', '2.1.310')).toBe(false);
  expect(versionAtLeast('2.1.311-beta.1', '2.1.310')).toBe(true);
  expect(compareVersions('2.1.310-beta.2', '2.1.310-beta.10')).toBeLessThan(0);
  expect(compareVersions('2.1.310-alpha', '2.1.310-beta')).toBeLessThan(0);
});

test('a text that is no version compares as undefined and is never at least anything', () => {
  expect(compareVersions('latest', '2.1.0')).toBeUndefined();
  expect(versionAtLeast('', '2.1.0')).toBe(false);
  expect(versionAtLeast('2.1', '2.1.0')).toBe(false);
});
