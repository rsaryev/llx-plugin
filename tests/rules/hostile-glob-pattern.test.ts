/**
 * permissions.md § What Read and Edit rules cover ("Read, Grep, Glob"), hostile spellings: a Glob
 * whose pattern is an absolute path searches where the pattern says, not the current directory, so
 * a rule on that directory covers it.
 */
import { describe, expect, test } from 'bun:test';
import { decision, deny, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('permissions.behavior.What Read and Edit rules cover', () => {
  test('a Read deny rule covers a Glob with an absolute pattern and no path', () => {
    const rules = rulesOf(['deny', 'Read(//etc/**)'], ['deny', 'Read(~/.ssh/**)']);
    for (const pattern of ['/etc/*', '/etc/**/*.conf', '/etc/ssh/sshd_config', '~/.ssh/*']) {
      expect({
        pattern,
        decision: decision('bypassPermissions', 'Glob', { pattern }, { rules }),
      }).toEqual({ pattern, decision: deny('deny-rule') });
    }
    expect(
      decision('bypassPermissions', 'Glob', { pattern: '/etc/*', path: '/work/app' }, { rules }),
    ).toEqual(deny('deny-rule'));
  });
});

describe('Glob patterns outside the working directory', () => {
  test('an absolute pattern outside the working directory is not a read in it', () => {
    expect(decision('default', 'Glob', { pattern: '/etc/*' }).outcome).toBe('ask');
    expect(decision('default', 'Glob', { pattern: 'src/**/*.ts' }).outcome).toBe('allow');
    expect(decision('default', 'Glob', { pattern: '/work/app/src/*.ts' }).outcome).toBe('allow');
  });
});
