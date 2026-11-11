/**
 * What `resolveHookCommand` says about a command hook beyond the substitution, so the hooks engine
 * can plan a command with it alone: hooks.md § Exec form and shell form (a bare name with whitespace
 * next to `args`), § Reference scripts by path in PowerShell hooks (the bare `$CLAUDE_PROJECT_DIR`
 * form "logs a warning"), § PowerShell started no program; plugins/manifest-reference.md (a hook of
 * no plugin keeps `${user_config.*}` as written). Judgments in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { NO_PROGRAM, onlyQuotedStrings, resolveHookCommand } from '../../../src/entry/loading.ts';
import { hook, scopeOf } from '../../support/hook-scope.ts';

describe('PowerShell started no program (hooks.md; judgment)', () => {
  const quoted = '"C:\\Tools\\guard.exe"';

  test('a hook in PowerShell by the host default whose command is only quoted strings does not start', async () => {
    const { resolved, notStarted, issues } = await resolveHookCommand(
      hook({ command: quoted }),
      scopeOf(),
      { defaultShell: 'powershell', path: 'hooks.PreToolUse' },
    );
    expect(resolved).toBeUndefined();
    expect(notStarted).toBe(NO_PROGRAM);
    expect(issues).toEqual([
      { severity: 'error', path: 'hooks.PreToolUse.command', message: NO_PROGRAM },
    ]);
  });

  test('a hook that names powershell runs as written; bash never stops it', async () => {
    const named = await resolveHookCommand(
      hook({ command: quoted, shell: 'powershell' }),
      scopeOf(),
    );
    expect(named.resolved?.spec).toEqual({ form: 'shell', command: quoted, shell: 'powershell' });
    expect(named.notStarted).toBeUndefined();
    const bash = await resolveHookCommand(hook({ command: quoted }), scopeOf());
    expect(bash.resolved?.spec).toMatchObject({ shell: 'bash' });
  });

  test('only quoted strings: several strings are still strings, a & or a bare word is not', () => {
    expect(onlyQuotedStrings(`"a" 'b' "c""d"`)).toBe(true);
    expect(onlyQuotedStrings(`& "C:\\Tools\\guard.exe"`)).toBe(false);
    expect(onlyQuotedStrings('guard.exe')).toBe(false);
  });
});

describe('the bare PowerShell path variables (hooks.md)', () => {
  test('every bare name is reported once, in order', async () => {
    const command =
      '& "$CLAUDE_PROJECT_DIR\\a.ps1"; & "$CLAUDE_PLUGIN_ROOT\\b.ps1" $CLAUDE_PROJECT_DIR';
    const { issues } = await resolveHookCommand(hook({ command, shell: 'powershell' }), scopeOf());
    expect(issues).toEqual(
      ['CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT'].map((name) => ({
        severity: 'warning',
        path: 'hook.command',
        message: `$${name} is an undefined variable in PowerShell and resolves to $null. Write \${${name}} or $env:${name}.`,
      })),
    );
  });
});

describe('exec form', () => {
  test('a bare name with whitespace says no executable of that name will start', async () => {
    const { issues } = await resolveHookCommand(
      hook({ command: 'node script.js', args: ['--fix'] }),
      scopeOf(),
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      '"node script.js" is a bare name with whitespace and "args" is set, so no executable of that name will start. Move the extra tokens into "args".',
    ]);
  });

  test('an issue of an args element names its index', async () => {
    const { issues } = await resolveHookCommand(
      hook({ command: 'run', args: ['--a', '${user_config.missing}'] }),
      scopeOf(),
    );
    expect(issues.map((issue) => issue.path)).toEqual(['hook.args[1]']);
  });
});

describe('a hook of no plugin (judgment)', () => {
  test('shell form is not refused for ${user_config.*}: the reference stays as written', async () => {
    const command = './notify.sh ${user_config.webhook_url}';
    const { resolved, issues } = await resolveHookCommand(hook({ command }), scopeOf(), {
      ofPlugin: false,
    });
    expect(resolved?.spec).toEqual({ form: 'shell', command, shell: 'bash' });
    expect(issues).toEqual([]);
  });

  test('exec form keeps ${user_config.*} as written too', async () => {
    const { resolved } = await resolveHookCommand(
      hook({ command: 'notify', args: ['${user_config.webhook_url}'] }),
      scopeOf(),
      { ofPlugin: false },
    );
    expect(resolved?.spec).toEqual({
      form: 'exec',
      command: 'notify',
      args: ['${user_config.webhook_url}'],
    });
  });

  test('it exports only the project folder: no plugin folder, data folder or options', async () => {
    const { resolved } = await resolveHookCommand(hook({ command: './check.sh' }), scopeOf(), {
      ofPlugin: false,
    });
    expect(resolved?.environment).toEqual({ CLAUDE_PROJECT_DIR: '/work/app' });
  });
});

describe('a reference that names no option (judgment)', () => {
  test('${user_config.<invalid key>} is no option reference: not refused, left as written for the shell', async () => {
    for (const command of ['./n.sh ${user_config.a-b}', './n.sh ${user_config.2fa}']) {
      const { resolved, issues } = await resolveHookCommand(hook({ command }), scopeOf());
      expect(resolved?.spec).toEqual({ form: 'shell', command, shell: 'bash' });
      expect(issues).toEqual([]);
    }
  });
});
