/**
 * settings-reference.md § Let one directory through the read or write block: "add it as a working
 * directory ... No allow rule lets Claude's file tools through either block."
 */
import { expect, test } from 'bun:test';
import { deny, onPath, pathsWith, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const READS = { blockReadsOutsideWorkingDirectories: true };
const WRITES = { blockWritesOutsideWorkingDirectories: true };
const shared = pathsWith({ additionalDirectories: ['/work/shared'] });

spec('permissions.reference.Let one directory through the read or write block', () => {
  test('an added working directory is reachable under the read block', () => {
    expect(
      onPath('bypassPermissions', 'Read', '/work/shared/a.txt', { ...READS, match: shared }),
    ).toMatchObject({ outcome: 'allow' });
    expect(
      onPath('bypassPermissions', 'Read', '/work/other/a.txt', { ...READS, match: shared }),
    ).toEqual(deny('outside-working-directory'));
  });
  test('an added working directory is reachable under the write block', () => {
    expect(
      onPath('bypassPermissions', 'Write', '/work/shared/a.txt', { ...WRITES, match: shared }),
    ).toMatchObject({ outcome: 'allow' });
  });
  test('no allow rule lets the file tools through either block', () => {
    const rules = rulesOf(['allow', 'Read(/work/other/**)'], ['allow', 'Edit(/work/other/**)']);
    expect(onPath('bypassPermissions', 'Read', '/work/other/a.txt', { ...READS, rules })).toEqual(
      deny('outside-working-directory'),
    );
    expect(onPath('bypassPermissions', 'Write', '/work/other/a.txt', { ...WRITES, rules })).toEqual(
      deny('outside-working-directory'),
    );
  });
});
