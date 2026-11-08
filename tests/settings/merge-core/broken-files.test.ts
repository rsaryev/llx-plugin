/**
 * settings.md § Edit a settings file ("Settings files are strict JSON: a `//` comment or a trailing
 * comma is a syntax error, and Claude Code reports the file as a Settings Error"), § Fix a broken
 * settings file (Settings Error, Settings Warning, Managed settings, Configuration error; "Claude
 * Code skips a broken user, project, or local file or its broken values and continues"), § A value
 * you set is ignored ("The file is broken"), § A committed key doesn't reach teammates; errors.md § Managed settings document could not be parsed, §
 * Configuration error in ~/.claude.json, § Claude configuration file was empty and no backup holds
 * anything.
 */
import { describe, expect, test } from 'bun:test';
import { permissionRuleLists, readClaudeJson } from '../../../src/settings/general/index.ts';
import { loadSettingsLayers, problemKind, type PolicyScope } from '../../../src/settings/index.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf, issuesOf } from '../../support/settings-layers.ts';
import { plan } from '../../support/marketplace-registry.ts';
import { spec } from '../../support/spec.ts';

const signal = new AbortController().signal;
const load = (sources: Partial<Record<PolicyScope, unknown>>) =>
  loadSettingsLayers({ read: (scope) => Promise.resolve(sources[scope]) }, signal);

const COMMENTED =
  '{\n  // lint without asking\n  "permissions": { "allow": ["Bash(npm run lint)"] }\n}';
const TRAILING = '{ "permissions": { "allow": ["Bash(npm run lint)"], } }';
const DOCS_EXAMPLE = JSON.stringify({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  permissions: {
    allow: ['Bash(npm run lint)', 'Bash(npm run test *)'],
    deny: ['Read(./.env)', 'Read(./.env.*)'],
  },
});

spec('settingsMerge.settings.Edit a settings file', () => {
  describe('settings files are strict JSON', () => {
    test('the docs example loads: the $schema line is an ordinary key and the rules apply', async () => {
      const { layers, issues } = await load({ user: DOCS_EXAMPLE });
      expect(issues).toEqual([]);
      const permissions = createGeneralView(layers).get('permissions');
      expect(permissions?.allow).toEqual(['Bash(npm run lint)', 'Bash(npm run test *)']);
      expect(permissions?.deny).toEqual(['Read(./.env)', 'Read(./.env.*)']);
    });

    test('a // comment is a syntax error, reported as a Settings Error, and the file is skipped', async () => {
      const { layers, issues } = await load({ user: COMMENTED });
      expect(layers).toEqual([]);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('error');
      expect(issues[0]?.message).toStartWith('Settings Error: user settings');
      expect(problemKind('user', issues[0] ?? { severity: 'error', path: '', message: '' })).toBe(
        'Settings Error',
      );
    });

    test('a trailing comma is a syntax error too', async () => {
      const { layers, issues } = await load({ project: TRAILING });
      expect(layers).toEqual([]);
      expect(issues.map((one) => one.severity)).toEqual(['error']);
    });
  });
});

const BROKEN = 'settingsMerge.settings.Fix a broken settings file';

spec(`${BROKEN}.Settings Error`, () => {
  describe('a user, project or local file with invalid JSON is skipped and the other files stay', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      test(`a broken ${scope} file is a Settings Error that leaves the rest of the settings in effect`, async () => {
        const rest: Partial<Record<PolicyScope, unknown>> = {
          user: { model: 'opus' },
          project: { spinnerTipsEnabled: true },
        };
        const { layers, issues } = await load({ ...rest, [scope]: '{ nope' });
        expect(issues.map((one) => [one.severity, problemKind(scope, one)])).toEqual([
          ['error', 'Settings Error'],
        ]);
        expect(issues[0]?.message).toContain('is skipped');
        expect(layers.map((layer) => layer.scope)).not.toContain(scope);
        expect(layers).toHaveLength(scope === 'local' ? 2 : 1);
      });
    }

    test('a file that is JSON but not an object is the same Settings Error', () => {
      const { issues } = { issues: issuesOf('project', [1, 2]) };
      expect(issues.map((one) => problemKind('project', one))).toEqual(['Settings Error']);
    });
  });
});

spec(`${BROKEN}.Settings Warning`, () => {
  describe('only individual entries fail: they are skipped and the rest of the file stays in effect', () => {
    test('a malformed entry is dropped with a warning and its neighbours keep working', () => {
      const raw = { enabledPlugins: { 'a@m': true, 'b@m': 'yes' }, model: 'opus' };
      const read = issuesOf('user', raw);
      expect(read.map((one) => [one.severity, problemKind('user', one)])).toEqual([
        ['warning', 'Settings Warning'],
      ]);
      const layer = layerOf('user', raw);
      expect(layer.settings.model).toBe('opus');
      expect(createGeneralView([layer]).get('enabledPlugins')).toEqual({ 'a@m': true });
    });

    test('a key the file may not carry is a warning too, and the other keys are read', () => {
      const raw = { modelPicker: { options: [{ model: 'opus' }] }, model: 'opus' };
      expect(issuesOf('project', raw).map((one) => problemKind('project', one))).toEqual([
        'Settings Warning',
      ]);
      expect(layerOf('project', raw).settings).toEqual({ model: 'opus' });
    });
  });
});

spec(`${BROKEN}.Managed settings`, () => {
  describe('Claude Code keeps enforcing the rest of the file; a document that is not JSON puts none of its settings in effect', () => {
    test('an invalid entry in managed settings is a warning, the rest of the file stays', () => {
      const raw = { disableAllHooks: 'yes', model: 'opus', permissions: { deny: ['Bash(rm *)'] } };
      const read = issuesOf('managed', raw);
      expect(read.map((one) => problemKind('managed', one))).toEqual(['Managed settings']);
      const view = createGeneralView([layerOf('managed', raw)]);
      expect(view.get('model')).toBe('opus');
      expect(view.get('permissions')?.deny).toEqual(['Bash(rm *)']);
    });

    test('a managed document that does not parse is the errors.md message, and nothing of it applies', async () => {
      const { layers, issues } = await load({ managed: '{ nope', user: { model: 'opus' } });
      expect(layers.map((layer) => layer.scope)).toEqual(['user']);
      expect(issues[0]?.severity).toBe('error');
      expect(issues[0]?.message).toStartWith(
        'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.',
      );
      expect(
        problemKind('managed', issues[0] ?? { severity: 'error', path: '', message: '' }),
      ).toBe('Managed settings');
    });

    test('an empty managed-settings.json counts as {} and is no problem', async () => {
      const { layers, issues } = await load({ managed: '  \n' });
      expect(issues).toEqual([]);
      expect(layers).toEqual([{ scope: 'managed', settings: {} }]);
    });
  });
});

const CLAUDE_JSON = {
  path: '/home/u/.claude.json',
  corruptedCopy: '/home/u/.claude/backups/.claude.json.corrupted.1793664000000',
  interactive: false,
} as const;

spec(`${BROKEN}.Configuration error`, () => {
  describe('~/.claude.json can not be parsed', () => {
    test('a -p run exits and the file is unchanged; the broken file is copied to ~/.claude/backups', () => {
      const outcome = readClaudeJson({ ...CLAUDE_JSON, text: '{ "a": ' });
      expect(outcome).toMatchObject({
        outcome: 'configuration-error',
        afterwards: 'exit',
        copyTo: '/home/u/.claude/backups/.claude.json.corrupted.1793664000000',
      });
    });

    test('an interactive session asks whether to exit and fix or reset to the default configuration', () => {
      expect(readClaudeJson({ ...CLAUDE_JSON, interactive: true, text: 'not json' })).toMatchObject(
        { afterwards: 'ask' },
      );
    });

    test('the output is the errors.md one: the backup line, and a cp line only when a backup holds something', () => {
      const backup = '/home/u/.claude/backups/.claude.json.backup.1793660400000';
      const withBackup = readClaudeJson({ ...CLAUDE_JSON, backup, text: '{' });
      expect(withBackup).toMatchObject({ outcome: 'configuration-error' });
      const lines = withBackup.outcome === 'configuration-error' ? withBackup.output : [];
      expect(lines[0]).toStartWith(
        'Claude configuration file at /home/u/.claude.json is corrupted: ',
      );
      expect(lines[1]).toBe(
        'The corrupted file has been backed up to: /home/u/.claude/backups/.claude.json.corrupted.1793664000000',
      );
      expect(lines).toContain(
        `You can manually restore it by running: cp -f "${backup}" "/home/u/.claude.json"`,
      );
      expect(lines.at(-1)).toStartWith('Configuration error in /home/u/.claude.json: ');
      const without = readClaudeJson({ ...CLAUDE_JSON, text: '{' });
      expect(
        without.outcome === 'configuration-error' ? without.output.join('\n') : '',
      ).not.toContain('cp -f');
    });

    test('a blank file with no backup holding anything starts with defaults; no file does too; valid JSON is no problem', () => {
      expect(readClaudeJson({ ...CLAUDE_JSON, text: '  \n' })).toEqual({
        outcome: 'starts-with-defaults',
        message:
          'Claude configuration file at /home/u/.claude.json was empty and no backup holds anything: starting with defaults.',
      });
      expect(readClaudeJson({ ...CLAUDE_JSON, text: undefined })).toEqual({ outcome: 'usable' });
      expect(readClaudeJson({ ...CLAUDE_JSON, text: '{"projects":{}}' })).toEqual({
        outcome: 'usable',
      });
    });
  });
});

spec('settingsMerge.settings.A value you set is ignored.The file is broken', () => {
  describe('invalid JSON or a rejected value makes Claude Code skip the file or the entry', () => {
    test('a broken file contributes nothing, so the value under it applies', async () => {
      const { layers } = await load({ user: { model: 'haiku' }, project: '{ "model": "opus", }' });
      expect(createGeneralView(layers).get('model')).toBe('haiku');
    });

    test('a rejected entry contributes nothing while the file stays', () => {
      const layers = [
        layerOf('user', { enabledPlugins: { 'a@m': true } }),
        layerOf('project', { enabledPlugins: { 'a@m': 'on' } }),
      ];
      expect(createGeneralView(layers).get('enabledPlugins')).toEqual({ 'a@m': true });
    });
  });
});

// An id with an apostrophe is a template literal: the SP2 gate cannot read it from a quoted string.
spec(`settingsMerge.settings.A committed key doesn't reach teammates`, () => {
  describe('a key Claude Code ignores in a repository file, and a key that waits for trust', () => {
    test('keys scoped User, User or managed or Managed never apply from the shared file, apart from a few that it can switch off', () => {
      const project = layerOf('project', {
        appendPlugins: ['x@m'],
        modelPicker: { options: [{ model: 'opus' }] },
        allowManagedHooksOnly: true,
        syncClaudeAiPlugins: false,
        remoteControlAtStartup: false,
      });
      expect(Object.keys(project.settings)).toEqual(['remoteControlAtStartup']);
      expect(
        issuesOf('project', { appendPlugins: ['x@m'], allowManagedHooksOnly: true }).map(
          (one) => one.severity,
        ),
      ).toEqual(['warning', 'warning']);
    });

    test('permissions.allow and additionalDirectories apply only after the teammate trusts the folder, deny and ask apply right away', () => {
      const project = layerOf('project', {
        permissions: {
          allow: ['Bash(make)'],
          additionalDirectories: ['../shared'],
          deny: ['Read(./.env)'],
          ask: ['Bash(git push *)'],
        },
      });
      const view = createGeneralView([project]);
      const untrusted = permissionRuleLists(view, () => false);
      expect(untrusted.allow).toEqual([]);
      expect(untrusted.additionalDirectories).toEqual([]);
      expect(untrusted.deny.map((entry) => entry.rule)).toEqual(['Read(./.env)']);
      expect(untrusted.ask.map((entry) => entry.rule)).toEqual(['Bash(git push *)']);
      const trusted = permissionRuleLists(view, () => true);
      expect(trusted.allow.map((entry) => entry.rule)).toEqual(['Bash(make)']);
      expect(trusted.additionalDirectories).toEqual([{ directory: '../shared', scope: 'project' }]);
    });

    test('extraKnownMarketplaces waits for trust too: no plugins from a marketplace the file declares', () => {
      const entries = { acme: { source: { source: 'github', repo: 'acme-corp/plugins' } } };
      expect(
        plan([['project', { extraKnownMarketplaces: entries }]], { isFolderTrusted: () => true })[0]
          ?.status,
      ).toBe('register');
      expect(
        plan([['project', { extraKnownMarketplaces: entries }]], {
          isFolderTrusted: () => false,
        })[0]?.status,
      ).not.toBe('register');
    });
  });
});
