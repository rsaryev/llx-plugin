/**
 * permissions.md § Bash > What a Bash rule doesn't match: "A Bash rule matches the command text
 * Claude writes, after Claude Code splits compound commands and strips wrappers. It doesn't match
 * the same program invoked in a different form", and the table of what each rule stops and does
 * not stop. Both columns are asserted through a deny rule. The same section's warning (a pattern
 * that constrains arguments is fragile) is asserted with its four listed variations.
 */
import { describe, expect, test } from 'bun:test';
import { denies } from '../support/bash-rules.ts';
import { spec } from '../support/spec.ts';

spec('permissions.rule.Bash(curl *)', () => {
  test('stops curl https://example.com, not the same program by path or inside sh -c', () => {
    expect(denies('Bash(curl *)', 'curl https://example.com')).toBe(true);
    expect(denies('Bash(curl *)', '/usr/bin/curl https://example.com')).toBe(false);
    expect(denies('Bash(curl *)', "sh -c 'curl https://example.com'")).toBe(false);
  });
});

spec('permissions.rule.Bash(rm *)', () => {
  test('stops rm -rf build/, not /bin/rm or bash -c', () => {
    expect(denies('Bash(rm *)', 'rm -rf build/')).toBe(true);
    expect(denies('Bash(rm *)', '/bin/rm -rf build/')).toBe(false);
    expect(denies('Bash(rm *)', "bash -c 'rm -rf build/'")).toBe(false);
  });
});

spec('permissions.rule.Bash(git push *)', () => {
  test('stops git push origin main, not the options-first or quoted forms', () => {
    expect(denies('Bash(git push *)', 'git push origin main')).toBe(true);
    expect(denies('Bash(git push *)', 'git -C . push origin main')).toBe(false);
    expect(denies('Bash(git push *)', 'git -c push.default=current push origin main')).toBe(false);
    expect(denies('Bash(git push *)', "git 'push' origin main")).toBe(false);
  });
});

describe('a pattern that constrains arguments is fragile (permissions.md warning)', () => {
  const rule = 'Bash(curl http://github.com/ *)';

  test('it matches the one form it was written for', () => {
    expect(denies(rule, 'curl http://github.com/ x')).toBe(true);
  });

  test('it does not match options before the URL, another protocol, a redirect or a variable', () => {
    for (const command of [
      'curl -X GET http://github.com/x',
      'curl https://github.com/x',
      'curl -L http://short.example.com/xyz',
      'URL=http://github.com && curl $URL',
    ]) {
      expect([command, denies(rule, command)]).toEqual([command, false]);
    }
  });
});
