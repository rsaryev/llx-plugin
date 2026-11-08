/**
 * plugins/manifest-reference.md § Environment variables (the three path variables) and
 * § Quoting and path separators (Windows); hooks.md § Reference scripts by path and § Reference
 * scripts by path in PowerShell hooks; plugins/loading.md (`data/<plugin-id>/` is created when a
 * component first uses it).
 *
 * What the kit owns is which port call each variable becomes and how the value is written into the
 * text; the paths themselves (and creating the data folder) are the host's, behind `Locations`.
 */
import { describe, expect, test } from 'bun:test';
import {
  substituteTemplate,
  type FieldPolicy,
  type SubstitutionScope,
} from '../../../src/loading/resolve/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { windowsLocations } from '../../support/windows-locations.ts';

const NORMALIZED: FieldPolicy = {
  userConfig: 'allow',
  environment: 'literal',
  paths: 'normalized',
};
const NATIVE: FieldPolicy = { ...NORMALIZED, paths: 'native' };
const REFERENCE: FieldPolicy = { ...NORMALIZED, paths: 'environment-reference' };

const scopeOf = (overrides: Partial<SubstitutionScope> = {}): SubstitutionScope => ({
  pluginId: 'formatter@acme-tools',
  locations: locations(),
  environment: fakeEnvironment(),
  userConfig: { declared: {}, values: {} },
  windows: false,
  ...overrides,
});
const substitute = (template: string, policy = NORMALIZED, scope = scopeOf()) =>
  substituteTemplate(template, scope, policy);

spec('environment.variable.${CLAUDE_PLUGIN_ROOT}', () => {
  test('resolves to the plugin root the host reports for that plugin', async () => {
    const result = await substitute('"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh');
    expect(result.text).toBe('"/plugins/formatter@acme-tools"/scripts/process.sh');
    expect(result.issues).toEqual([]);
  });
  test('each plugin gets its own root', async () => {
    const other = scopeOf({ pluginId: 'linter@acme-tools' });
    expect((await substitute('${CLAUDE_PLUGIN_ROOT}', NORMALIZED, other)).text).toBe(
      '/plugins/linter@acme-tools',
    );
  });
  test('every occurrence is replaced, in one pass', async () => {
    const result = await substitute('${CLAUDE_PLUGIN_ROOT}/a ${CLAUDE_PLUGIN_ROOT}/b');
    expect(result.text).toBe('/plugins/formatter@acme-tools/a /plugins/formatter@acme-tools/b');
  });
  test('the data folder is not touched by a reference to the root', async () => {
    const host = locations();
    await substitute('${CLAUDE_PLUGIN_ROOT}', NORMALIZED, scopeOf({ locations: host }));
    expect(host.dataCreated).toEqual([]);
  });
});

spec('environment.variable.${CLAUDE_PLUGIN_DATA}', () => {
  test('resolves to the data folder named by the sanitized plugin identifier', async () => {
    const result = await substitute('${CLAUDE_PLUGIN_DATA}/node_modules');
    expect(result.text).toBe('/data/formatter-acme-tools/node_modules');
  });
  test('the data folder is asked for only when a template references it', async () => {
    const host = locations();
    const scope = scopeOf({ locations: host });
    await substitute('${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PROJECT_DIR} plain text', NORMALIZED, scope);
    expect(host.dataCreated).toEqual([]);
    await substitute('${CLAUDE_PLUGIN_DATA}', NORMALIZED, scope);
    expect(host.dataCreated).toEqual(['formatter-acme-tools']);
  });
  test('several references in one template ask for the folder once', async () => {
    const host = locations();
    const scope = scopeOf({ locations: host });
    await substitute('${CLAUDE_PLUGIN_DATA}/a:${CLAUDE_PLUGIN_DATA}/b', NORMALIZED, scope);
    expect(host.dataCreated).toEqual(['formatter-acme-tools']);
  });
});

spec('environment.variable.${CLAUDE_PROJECT_DIR}', () => {
  test('resolves to the project root', async () => {
    const result = await substitute('${CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh');
    expect(result.text).toBe('/work/app/.claude/hooks/check-style.sh');
  });
  test('does not move with the plugin: another plugin sees the same project', async () => {
    const other = scopeOf({ pluginId: 'linter@acme-tools' });
    expect((await substitute('${CLAUDE_PROJECT_DIR}', NORMALIZED, other)).text).toBe('/work/app');
  });
});

describe('the three variables on a Windows host', () => {
  const windows = scopeOf({ locations: windowsLocations(), windows: true });
  const cases = [
    ['CLAUDE_PLUGIN_ROOT', 'C:\\Users\\you\\.claude\\plugins\\cache\\formatter@acme-tools'],
    ['CLAUDE_PLUGIN_DATA', 'C:\\Users\\you\\.claude\\plugins\\data\\formatter-acme-tools'],
    ['CLAUDE_PROJECT_DIR', 'C:\\Users\\you\\app'],
  ] as const;
  for (const [name, native] of cases) {
    spec(`environment.variable.\${${name}}`, () => {
      test('is written with forward slashes in a shell-form command', async () => {
        const result = await substitute(`\${${name}}/run.sh`, NORMALIZED, windows);
        expect(result.text).toBe(`${native.replaceAll('\\', '/')}/run.sh`);
        expect(result.text).toMatch(/^C:\/Users\/you\//);
      });
      test('keeps its native backslashes in an exec-form hook', async () => {
        expect((await substitute(`\${${name}}`, NATIVE, windows)).text).toBe(native);
      });
      test('becomes PowerShell’s ${env:NAME} form in a PowerShell shell-form command', async () => {
        const result = await substitute(`& "\${${name}}\\run.ps1"`, REFERENCE, windows);
        expect(result.text).toBe(`& "\${env:${name}}\\run.ps1"`);
      });
    });
  }
  test('a POSIX host keeps its paths as they are', async () => {
    expect((await substitute('${CLAUDE_PLUGIN_ROOT}')).text).toBe('/plugins/formatter@acme-tools');
  });
  test('the PowerShell form asks the host for nothing: the process environment carries the value', async () => {
    const host = windowsLocations();
    const scope = scopeOf({ locations: host, windows: true });
    await substitute('${CLAUDE_PLUGIN_DATA}', REFERENCE, scope);
    expect(host.dataCreated).toEqual([]);
  });
});
