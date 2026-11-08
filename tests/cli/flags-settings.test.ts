/**
 * cli-reference.md § CLI flags (`--setting-sources`: a comma-separated list of `user`, `project`,
 * `local`; `--settings`: a path to a settings JSON file or an inline JSON string whose values override
 * the same keys in the settings files for this session while omitted keys keep their file values, a
 * regular file no larger than 2 MiB), errors.md § Settings file exceeds the 2MiB limit (`Error:
 * Settings file exceeds the 2MiB limit: <path>`; a device, FIFO or socket is `Cannot use settings
 * file (Not a regular file (device, FIFO, or socket))`) and agent-sdk/claude-code-features.md §
 * Control filesystem settings with settingSources (managed policy is read whatever the list says).
 * The wording of the refusals the docs do not quote is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { SETTINGS_FILE_LIMIT } from '../../src/cli/flags/settings.ts';
import { createPolicyView, type PolicyLayer, type PolicyScope } from '../../src/settings/index.ts';
import { file, planOf } from '../support/session-flags.ts';
import { layerOf } from '../support/settings-layers.ts';
import { spec } from '../support/spec.ts';

const view = (layers: readonly PolicyLayer[], scopes: readonly PolicyScope[] | undefined) =>
  createPolicyView(
    scopes === undefined ? layers : layers.filter((layer) => scopes.includes(layer.scope)),
  );

const files = [
  layerOf('user', { enableWorkflows: true }),
  layerOf('project', { workflowKeywordTriggerEnabled: true }),
  layerOf('local', { workflowSizeGuideline: 'large' }),
  layerOf('managed', { disableWorkflows: false }),
];

spec('cli.flag.--setting-sources', () => {
  test('user,project loads the user and project files, not the local one', () => {
    const plan = planOf({ '--setting-sources': 'user,project' });
    expect(plan.settingScopes).toContain('user');
    expect(plan.settingScopes).toContain('project');
    expect(plan.settingScopes).not.toContain('local');
    const loaded = view(files, plan.settingScopes);
    expect(loaded.get('enableWorkflows')).toBe(true);
    expect(loaded.get('workflowKeywordTriggerEnabled')).toBe(true);
    expect(loaded.get('workflowSizeGuideline')).toBeUndefined();
  });

  test('a source left out supplies none of its keys', () => {
    const loaded = view(files, planOf({ '--setting-sources': 'local' }).settingScopes);
    expect(loaded.get('enableWorkflows')).toBeUndefined();
    expect(loaded.get('workflowSizeGuideline')).toBe('large');
  });

  test('managed policy and --settings are read whatever the list says', () => {
    const scopes = planOf({ '--setting-sources': 'user' }).settingScopes;
    expect(scopes).toContain('managed');
    expect(scopes).toContain('flag');
    expect(view(files, scopes).get('disableWorkflows')).toBe(false);
  });

  test('the sources are separated by commas, with spaces allowed around each', () => {
    const scopes = planOf({ '--setting-sources': ' user , local ' }).settingScopes;
    expect(scopes).toContain('user');
    expect(scopes).toContain('local');
    expect(scopes).not.toContain('project');
  });

  test('an empty list loads none of the three files', () => {
    const scopes = planOf({ '--setting-sources': '' }).settingScopes;
    expect(scopes).toEqual(['managed', 'parent', 'flag']);
  });

  test('a name that is not user, project or local fails the run', () => {
    const plan = planOf({ '--setting-sources': 'user,managed' });
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]).toContain('managed');
  });

  test('without the flag every source loads', () => {
    expect(planOf({}).settingScopes).toBeUndefined();
  });

  test('the settings of an --add-dir directory follow project', () => {
    expect(planOf({ '--setting-sources': 'project' }).settingScopes).toContain('addDir');
    expect(planOf({ '--setting-sources': 'user' }).settingScopes).not.toContain('addDir');
  });
});

const given = (value: string, extra = {}) => planOf({ '--settings': value }, extra);

describe('--settings', () => {
  spec('cli.flag.--settings', () => {
    test('an inline JSON string is the flag layer', () => {
      const plan = given('{"enableWorkflows": false}');
      expect(plan.flagSettings?.scope).toBe('flag');
      expect(plan.flagSettings?.settings).toEqual({ enableWorkflows: false });
      expect(plan.refusals).toEqual([]);
    });

    test('a path reads a settings JSON file', () => {
      const plan = given('./settings.json', {
        files: { './settings.json': file('{"enableWorkflows": false}') },
      });
      expect(plan.flagSettings?.settings).toEqual({ enableWorkflows: false });
    });

    test('its values override the same keys in the settings files, and omitted keys keep their file values', () => {
      const flag = given('{"enableWorkflows": false}').flagSettings;
      expect(flag).toBeDefined();
      const loaded = createPolicyView([
        layerOf('user', { enableWorkflows: true, workflowKeywordTriggerEnabled: true }),
        ...(flag === undefined ? [] : [flag]),
      ]);
      expect(loaded.get('enableWorkflows')).toBe(false);
      expect(loaded.get('workflowKeywordTriggerEnabled')).toBe(true);
    });

    test('the file may be exactly 2 MiB but no larger', () => {
      const text = '{"enableWorkflows": true}';
      const at = given('./s.json', {
        files: { './s.json': file(text, { bytes: SETTINGS_FILE_LIMIT }) },
      });
      expect(at.refusals).toEqual([]);
      const over = given('./s.json', {
        files: { './s.json': file(text, { bytes: SETTINGS_FILE_LIMIT + 1 }) },
      });
      expect(over.refusals).toEqual(['Error: Settings file exceeds the 2MiB limit: ./s.json']);
      expect(over.flagSettings).toBeUndefined();
    });

    test('a device, FIFO or socket is not a regular file', () => {
      const plan = given('/dev/zero', { files: { '/dev/zero': file('', { regular: false }) } });
      expect(plan.refusals).toHaveLength(1);
      expect(plan.refusals[0]).toContain(
        'Error: Cannot use settings file (Not a regular file (device, FIFO, or socket))',
      );
      expect(plan.refusals[0]).toContain('/dev/zero');
    });

    test('a path that does not exist fails the run', () => {
      expect(given('./gone.json').refusals).toEqual([
        'Error: Settings file not found: ./gone.json',
      ]);
    });

    test('text that is not JSON fails the run', () => {
      expect(given('{not json').refusals[0]).toContain('Invalid JSON passed to --settings');
    });

    test('JSON that is not an object loads no key and says the settings are skipped', () => {
      const notObject = given('./a.json', { files: { './a.json': file('[1]') } });
      expect(notObject.flagSettings?.settings).toEqual({});
      expect(notObject.warnings[0]?.message).toContain('not a valid JSON object');
    });
  });

  test('a key the flag layer may not carry is dropped with a warning, as for any layer', () => {
    const plan = given('{"channelsEnabled": true}');
    expect(plan.flagSettings?.settings).toEqual({});
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
