/**
 * The meeting point of the permission settings and `decide` (docs/API.md, "Permissions in a session"):
 * rules parsed with the file they come from, the starting mode and the facts the settings decide. The
 * behaviour of each key is proven in tests/settings/permissions; this file holds what the assembly
 * decides on its own, so it is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import { startPermissions } from '../../src/host/permission-session.ts';
import { decide } from '../../src/rules/index.ts';
import { permissionsOf, headless, terminal } from '../support/permissions-policy.ts';
import { sessionOf } from '../support/permission-session.ts';
import { call, matchContext } from '../support/rule-context.ts';

describe('startPermissions', () => {
  test('parses every rule with the kind of file it was written in', () => {
    const policy = permissionsOf(
      [
        ['managed', { permissions: { deny: ['Read(./.env)'] } }],
        ['project', { permissions: { allow: ['Bash(npm test)'] } }],
        ['flag', { permissions: { ask: ['Bash(git push *)'] } }],
        ['parent', { permissions: { deny: ['WebFetch'] } }],
      ],
      { parentMerge: true },
    );
    const { context } = sessionOf(policy, terminal(), {
      commandLine: { disallowed: ['Bash(rm *)'] },
    });
    expect(context.rules.map((rule) => `${rule.text}@${rule.source.kind}`).toSorted()).toEqual([
      'Bash(git push *)@flag-settings',
      'Bash(npm test)@project',
      'Bash(rm *)@cli',
      'Read(./.env)@managed',
      'WebFetch@embedder-managed',
    ]);
  });

  test('reports a rule it cannot parse and goes on with the others', () => {
    const policy = permissionsOf([['user', { permissions: { allow: ['Bash(', 'Bash(ls)'] } }]]);
    const session = sessionOf(policy);
    expect(session.context.rules.map((rule) => rule.text)).toEqual(['Bash(ls)']);
    expect(session.issues).toHaveLength(1);
  });

  test("the settings' directories join the session's own, each once", () => {
    const policy = permissionsOf([
      ['user', { permissions: { additionalDirectories: ['/work/cli', '/work/user'] } }],
    ]);
    const paths = { ...matchContext.paths, additionalDirectories: ['/work/cli'] };
    const { context } = sessionOf(policy, terminal(), { paths });
    expect(context.match.paths.additionalDirectories).toEqual(['/work/cli', '/work/user']);
  });

  test('a terminal session is interactive; a -p run cannot prompt unless a callback answers', () => {
    expect(sessionOf(permissionsOf([]), terminal()).context.interactive).toBe(true);
    const run = sessionOf(permissionsOf([]), headless()).context;
    expect([run.interactive, run.cannotPrompt]).toEqual([false, true]);
    const withCallback = sessionOf(permissionsOf([]), headless(), {
      permissionCallback: true,
    }).context;
    expect([withCallback.cannotPrompt, withCallback.permissionCallback]).toEqual([false, true]);
  });

  test('a host with its own approval interface says interactive without claiming to be a terminal', () => {
    const policy = permissionsOf([]);
    const app = sessionOf(policy, headless({ permissionMode: 'default' }), { interactive: true });
    expect([app.mode, app.context.interactive, app.context.cannotPrompt]).toEqual([
      'default',
      true,
      false,
    ]);
    // No terminal surface: the built-in default stays the headless one, not `auto`.
    expect(sessionOf(policy, headless(), { interactive: true }).mode).toBe('default');
    // A terminal can say it has nobody to answer.
    expect(sessionOf(policy, terminal(), { interactive: false }).context.interactive).toBe(false);
    // Plan mode's bypass behaviour follows the same fact (`bypassAvailable` with `interactive`).
    const edit = call('Edit', { file_path: '/work/app/a.ts' });
    const planned = (interactive: boolean) =>
      sessionOf(policy, headless({ permissionMode: 'plan' }), { interactive }).context;
    expect(decide(edit, { ...planned(true), bypassAvailable: true }).outcome).toBe('allow');
    // Not interactive, nobody to answer and no callback: the would-be prompt is a denial.
    expect(decide(edit, { ...planned(false), bypassAvailable: true }).outcome).toBe('deny');
  });

  test('carries the notices of the start and autoMode.classifyAllShell into the context', () => {
    const hipaa = sessionOf(permissionsOf([]), terminal({ hipaa: true }));
    expect(hipaa.notices).toHaveLength(1);
    expect(sessionOf(permissionsOf([]), terminal()).notices).toEqual([]);
    const policy = permissionsOf([['user', { autoMode: { classifyAllShell: true } }]]);
    expect(sessionOf(policy).context.classifyAllShell).toBe(true);
  });

  test('a refused start comes back as the refusal', () => {
    const policy = permissionsOf([
      ['managed', { permissions: { disableBypassPermissionsMode: 'disable' } }],
    ]);
    const started = startPermissions({
      policy,
      start: terminal({ dangerouslySkipPermissions: true }),
      paths: matchContext.paths,
    });
    expect(started.outcome).toBe('refused');
  });

  test('the context decides a call: a settings deny rule blocks a command the mode would allow', () => {
    const policy = permissionsOf([
      ['user', { permissions: { deny: ['Bash(curl *)'], defaultMode: 'bypassPermissions' } }],
    ]);
    const { context, mode } = sessionOf(policy);
    expect(mode).toBe('bypassPermissions');
    expect(decide(call('Bash', { command: 'curl x.io' }), context)).toEqual({
      outcome: 'deny',
      reason: 'deny-rule',
    });
    expect(decide(call('Bash', { command: 'npm test' }), context)).toEqual({
      outcome: 'allow',
      reason: 'mode-bypass',
    });
  });
});
