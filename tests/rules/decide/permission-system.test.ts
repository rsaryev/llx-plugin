/**
 * permissions.md § "Permission system": the table of tool types, whether Manual mode asks before the
 * action runs and what "Yes, and don't ask again" does (Read-only: "No, within the working directory
 * and additional directories"; Bash: "Yes, except a built-in set of read-only commands", "Permanently
 * per repository and command"; File modification: "Yes", "Until session end"; Web fetch: "Yes, except a
 * built-in set of preapproved documentation domains", "Permanently per repository and domain"; Web
 * search: "Yes", "Permanently per repository"); tools-reference.md § "WebFetch tool behavior" ("An
 * explicit `WebFetch(domain:...)` rule in `deny`, `ask`, or `allow` takes precedence over the
 * preapproved set"). Asserted through `decide()` in Manual mode.
 */
import { expect, test } from 'bun:test';
import { approvalMemory } from '../../../src/rules/index.ts';
import {
  allow,
  ask,
  bash,
  decision,
  deny,
  onPath,
  pathsWith,
  rulesOf,
} from '../../support/decide.ts';
import { spec } from '../../support/spec.ts';
import { toolTypeOf } from '../../../src/rules/decide/approval-memory.ts';

const docs = (hostname: string): boolean => hostname === 'docs.example.dev';
const fetch = (url: string, overrides = {}) =>
  decision('default', 'WebFetch', { url, prompt: 'summarize' }, overrides);
const behaviorOverrides = (behavior: 'deny' | 'ask' | 'allow') => ({
  preapprovedFetchDomain: docs,
  rules: rulesOf([behavior, 'WebFetch(domain:docs.example.dev)']),
});

spec('permissions.behavior.Permission system.Read-only', () => {
  test('file reads and Grep need no approval within the working directory and additional directories', () => {
    expect(onPath('default', 'Read', '/work/app/src/a.ts')).toEqual(
      allow('read-in-working-directory'),
    );
    expect(onPath('default', 'Grep', '/work/app/src')).toEqual(allow('read-in-working-directory'));
    const match = pathsWith({ additionalDirectories: ['/work/shared'] });
    expect(onPath('default', 'Read', '/work/shared/notes.md', { match })).toEqual(
      allow('read-in-working-directory'),
    );
  });

  test('a read outside them asks', () => {
    expect(onPath('default', 'Read', '/etc/hosts')).toEqual(ask('default-prompt'));
    expect(onPath('default', 'Glob', '/home/alice')).toEqual(ask('default-prompt'));
  });

  test('"Yes, and don\'t ask again" is N/A: there is nothing to remember', () => {
    expect(approvalMemory('Read')).toEqual({ lifetime: 'none', keyedBy: 'none' });
    expect(approvalMemory('Grep')?.lifetime).toBe('none');
  });
});

spec('permissions.behavior.Permission system.Bash commands', () => {
  test('a shell command asks, except a built-in set of read-only commands', () => {
    expect(bash('default', 'npm test')).toEqual(ask('default-prompt'));
    expect(bash('default', 'rm -rf build')).toEqual(ask('default-prompt'));
    for (const command of ['ls', 'git status', 'cat README.md', 'git log --oneline']) {
      expect(bash('default', command)).toEqual(allow('read-only-command'));
    }
  });

  test('a compound command asks when any part is not read-only', () => {
    expect(bash('default', 'ls && npm install')).toEqual(ask('default-prompt'));
  });

  test('"Yes, and don\'t ask again" lasts permanently, per repository and command', () => {
    expect(approvalMemory('Bash')).toEqual({ lifetime: 'repository', keyedBy: 'command' });
    expect(approvalMemory('PowerShell')).toEqual({ lifetime: 'repository', keyedBy: 'command' });
  });
});

spec('permissions.behavior.Permission system.File modification', () => {
  test('editing or writing a file asks, inside the working directory too', () => {
    expect(onPath('default', 'Edit', '/work/app/src/a.ts')).toEqual(ask('default-prompt'));
    expect(onPath('default', 'Write', '/work/app/new.ts')).toEqual(ask('default-prompt'));
    expect(onPath('default', 'NotebookEdit', '/work/app/a.ipynb')).toEqual(ask('default-prompt'));
  });

  test('"Yes, and don\'t ask again" lasts until the session ends and is not saved to a file', () => {
    expect(approvalMemory('Edit')).toEqual({ lifetime: 'session', keyedBy: 'none' });
    expect(approvalMemory('Write')?.lifetime).toBe('session');
    expect(approvalMemory('NotebookEdit')?.lifetime).toBe('session');
  });
});

spec('permissions.behavior.Permission system.Web fetch', () => {
  test('a fetch asks', () => {
    expect(fetch('https://example.com/page')).toEqual(ask('default-prompt'));
  });

  test('a built-in set of preapproved documentation domains fetches without a prompt', () => {
    expect(fetch('https://docs.example.dev/guide', { preapprovedFetchDomain: docs })).toEqual(
      allow('preapproved-domain'),
    );
    expect(fetch('https://example.com/page', { preapprovedFetchDomain: docs })).toEqual(
      ask('default-prompt'),
    );
  });

  test('an explicit WebFetch(domain:...) rule takes precedence over the preapproved set: deny, ask or allow', () => {
    expect(fetch('https://docs.example.dev/x', behaviorOverrides('deny'))).toEqual(
      deny('deny-rule'),
    );
    expect(fetch('https://docs.example.dev/x', behaviorOverrides('ask'))).toEqual(ask('ask-rule'));
    expect(fetch('https://docs.example.dev/x', behaviorOverrides('allow'))).toEqual(
      allow('allow-rule'),
    );
  });

  test('an allow rule for a domain approves a fetch there', () => {
    const rules = rulesOf(['allow', 'WebFetch(domain:example.com)']);
    expect(fetch('https://example.com/a', { rules })).toEqual(allow('allow-rule'));
    expect(fetch('https://other.org/a', { rules })).toEqual(ask('default-prompt'));
  });

  test('acceptEdits mode asks the same way; "don\'t ask again" lasts permanently, per repository and domain', () => {
    expect(
      decision('acceptEdits', 'WebFetch', { url: 'https://example.com', prompt: 'p' }),
    ).toEqual(ask('default-prompt'));
    expect(approvalMemory('WebFetch')).toEqual({ lifetime: 'repository', keyedBy: 'domain' });
  });
});

spec('permissions.behavior.Permission system.Web search', () => {
  test('a search asks', () => {
    expect(decision('default', 'WebSearch', { query: 'claude code hooks' })).toEqual(
      ask('default-prompt'),
    );
  });

  test('"Yes, and don\'t ask again" lasts permanently, per repository', () => {
    expect(approvalMemory('WebSearch')).toEqual({ lifetime: 'repository', keyedBy: 'tool' });
  });

  test('a bare WebSearch allow rule approves it', () => {
    const rules = rulesOf(['allow', 'WebSearch']);
    expect(decision('default', 'WebSearch', { query: 'x' }, { rules })).toEqual(
      allow('allow-rule'),
    );
  });
});

test('every tool type of the table has an entry and a tool outside it has none', () => {
  expect(toolTypeOf('WebSearch')).toBe('web-search');
  expect(toolTypeOf('mcp__x__y')).toBeUndefined();
  expect(approvalMemory('Skill')).toBeUndefined();
});
