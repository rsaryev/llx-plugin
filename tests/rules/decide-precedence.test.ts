/**
 * permissions.md § Manage permissions ("Rules are evaluated in order: deny, then ask, then allow ...
 * rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every
 * matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`")
 * and permission-modes.md § Available modes ("Deny rules block in every mode, including
 * `bypassPermissions`"). The order is asserted through `decide()` in each of the six modes.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_MODES } from '../../src/protocol/permission-modes.ts';
import { allow, ask, bash, deny, onPath, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const AUTO = { autoAvailable: true };

for (const mode of PERMISSION_MODES) {
  spec(`permissions.mode.${mode}`, () => {
    describe(`deny, then ask, then allow in ${mode} mode`, () => {
      test('a broad deny rule beats a narrower allow rule (the docs example)', () => {
        const rules = rulesOf(['deny', 'Bash(aws *)'], ['allow', 'Bash(aws s3 ls)']);
        expect(bash(mode, 'aws s3 ls', { ...AUTO, rules })).toEqual(deny('deny-rule'));
      });

      test('the order does not depend on which rule is written first', () => {
        const rules = rulesOf(['allow', 'Bash(aws s3 ls)'], ['deny', 'Bash(aws *)']);
        expect(bash(mode, 'aws s3 ls', { ...AUTO, rules })).toEqual(deny('deny-rule'));
      });

      test('a deny rule on a file blocks a read inside the working directory', () => {
        const rules = rulesOf(['deny', 'Read(./.env)']);
        expect(onPath(mode, 'Read', '/work/app/.env', { ...AUTO, rules })).toEqual(
          deny('deny-rule'),
        );
      });
    });
  });
}

spec('permissions.mode.default', () => {
  describe('ask beats allow, and deny beats ask', () => {
    test('a matching ask rule prompts even when a more specific allow rule also matches', () => {
      const rules = rulesOf(['ask', 'Bash(aws *)'], ['allow', 'Bash(aws s3 ls)']);
      expect(bash('default', 'aws s3 ls', { rules })).toEqual(ask('ask-rule'));
    });

    test('a deny rule beats an ask rule on the same call', () => {
      const rules = rulesOf(['ask', 'Bash(aws *)'], ['deny', 'Bash(aws s3 rm *)']);
      expect(bash('default', 'aws s3 rm x', { rules })).toEqual(deny('deny-rule'));
      expect(bash('default', 'aws s3 ls', { rules })).toEqual(ask('ask-rule'));
    });

    test('a narrow allow rule still approves a call no deny or ask rule matches', () => {
      const rules = rulesOf(['deny', 'Bash(aws s3 rm *)'], ['allow', 'Bash(aws s3 ls)']);
      expect(bash('default', 'aws s3 ls', { rules })).toEqual(allow('allow-rule'));
    });

    test('a deny rule on any subcommand of a compound command blocks it', () => {
      const rules = rulesOf(['deny', 'Bash(rm *)'], ['allow', 'Bash(npm test)']);
      expect(bash('default', 'npm test && rm -rf build', { rules })).toEqual(deny('deny-rule'));
    });
  });
});
