/**
 * What the kit decides where the docs are silent about the prompts of a session (spec/judgments.md),
 * outside spec(): where nobody can answer, connector tools, WebFetch's preapproved set, the table of
 * what "don't ask again" remembers.
 */
import { describe, expect, test } from 'bun:test';
import { toolTypeOf } from '../../../src/rules/index.ts';
import { allow, ask, bash, classify, decision, deny, rulesOf } from '../../support/decide.ts';

describe('where nobody can answer a prompt', () => {
  const headless = { cannotPrompt: true };

  test('only an ask becomes a denial: an allow, a deny and a classification stand', () => {
    expect(bash('default', 'npm test', headless)).toEqual(deny('prompt-unavailable'));
    expect(bash('default', 'ls', headless)).toEqual(allow('read-only-command'));
    const rules = rulesOf(['deny', 'Bash(rm *)']);
    expect(bash('default', 'rm x', { ...headless, rules })).toEqual(deny('deny-rule'));
    expect(bash('auto', 'npm test', { ...headless, autoAvailable: true })).toEqual(
      classify('mode-auto'),
    );
  });

  test("the denial replaces an ask rule's prompt too", () => {
    const rules = rulesOf(['ask', 'Bash(git push *)']);
    expect(bash('default', 'git push', { ...headless, rules })).toEqual(deny('prompt-unavailable'));
  });
});

describe('connector tools the organization set to ask', () => {
  test('are not matched by a name the host did not list: other MCP tools follow the mode', () => {
    const connectors = new Set(['mcp__crm__lookup']);
    expect(
      decision('default', 'mcp__crm__update', {}, { connectorToolsSetToAsk: connectors }),
    ).toEqual(ask('default-prompt'));
  });
});

describe("WebFetch's preapproved domains", () => {
  const docs = (hostname: string): boolean => hostname === 'docs.example.dev';
  const fetch = (url: unknown, overrides = {}) =>
    decision('default', 'WebFetch', { url, prompt: 'p' }, overrides);

  test('the host name is matched whole and in lower case; a URL that does not parse is not preapproved', () => {
    expect(fetch('https://DOCS.example.dev/a', { preapprovedFetchDomain: docs })).toEqual(
      allow('preapproved-domain'),
    );
    expect(fetch('https://sub.docs.example.dev/a', { preapprovedFetchDomain: docs })).toEqual(
      ask('default-prompt'),
    );
    expect(fetch('not a url', { preapprovedFetchDomain: docs })).toEqual(ask('default-prompt'));
    expect(fetch(42, { preapprovedFetchDomain: docs })).toEqual(ask('default-prompt'));
  });

  test('without a host predicate nothing is preapproved', () => {
    expect(fetch('https://docs.example.dev/a')).toEqual(ask('default-prompt'));
  });
});

test('PowerShell is the Bash row of the permission table, and Monitor and Skill are not in it', () => {
  expect(toolTypeOf('PowerShell')).toBe('bash');
  expect(toolTypeOf('Monitor')).toBeUndefined();
  expect(toolTypeOf('Skill')).toBeUndefined();
});
