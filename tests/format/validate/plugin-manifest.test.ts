/**
 * plugins/manifest-reference.md § Path rules ("`skills`: also accepts `"."`. Both `"."` and `"./"`
 * denote the plugin root") and § Validate the manifest ("Claude Code reports the same problem
 * when it loads the plugin"): one validator, whose path rules loading applies too.
 */
import { expect, test } from 'bun:test';
import { checkPluginManifest } from '../../../src/format/validate/plugin-manifest.ts';
import { readManifest, validateManifest } from '../../../src/format/manifest.ts';
import { spec } from '../../support/spec.ts';

const complete = { version: '1.0.0', description: 'Demo', author: { name: 'Team' } };

spec(['manifest.field.skills', 'manifest.rule.Path-only fields'], () => {
  test('skills accepts "." and "./" for the plugin root, alone or in a list', () => {
    for (const skills of ['.', './', ['./extra-skills/', '.']]) {
      expect(checkPluginManifest({ name: 'demo', ...complete, skills }).findings).toEqual([]);
      expect(readManifest({ name: 'demo', skills }).manifest).toBeDefined();
    }
  });

  test('another path key still refuses "." as not starting with "./"', () => {
    expect(checkPluginManifest({ name: 'demo', ...complete, workflows: '.' }).findings).toEqual([
      { severity: 'error', path: 'workflows', message: 'Invalid string: must start with "./"' },
    ]);
  });

  test('loading reports the validator’s path problem and does not load the manifest', () => {
    const read = readManifest({ name: 'demo', agents: './dir' });
    expect(read.manifest).toBeUndefined();
    expect(read.issues).toEqual(
      checkPluginManifest({ name: 'demo', ...complete, agents: './dir' }).findings,
    );
  });
});

test('validateManifest is the validator: its findings and the inline ones, nothing of its own', () => {
  const raw = { name: 'Demo', hooks: { Nope: [] }, skills: '../x' };
  const checks = checkPluginManifest(raw);
  expect(validateManifest(raw)).toEqual([...checks.findings, ...checks.inline]);
});

spec('manifest.field.userConfig', () => {
  test('the validator applies the `options` rules loading applies ("fails to load")', () => {
    const userConfig = {
      region: { type: 'number', title: 'Region', description: 'Where', options: ['eu'] },
    };
    const raw = { name: 'demo', ...complete, userConfig };
    expect(readManifest(raw).manifest).toBeUndefined();
    expect(checkPluginManifest(raw).findings.map((found) => found.severity)).toContain('error');
  });
});
