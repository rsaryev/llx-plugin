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
import type { Locations } from '../../../src/ports/index.ts';
import {
  resolveLspServer,
  resolveMcpServer,
  substituteTemplate,
  type FieldPolicy,
  type SubstitutionScope,
} from '../../../src/loading/resolve/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { windowsLocations } from '../../support/windows-locations.ts';
import { substituter } from '../../../src/loading/resolve/substituter.ts';

const NORMALIZED: FieldPolicy = {
  userConfig: 'allow',
  environment: 'literal',
  paths: 'normalized',
};
const NATIVE: FieldPolicy = { ...NORMALIZED, paths: 'native' };
const REFERENCE: FieldPolicy = { ...NORMALIZED, paths: 'environment-reference' };

/** A host that answers with fixed paths and records which port method was asked, with which id. */
function recordingHost(paths: { root?: string; data?: string; project?: string } = {}) {
  const calls: string[] = [];
  const host: Locations = {
    ...locations(),
    pluginRoot: (id) => {
      calls.push(`pluginRoot(${id})`);
      return paths.root ?? '/r';
    },
    pluginData: (id) => {
      calls.push(`pluginData(${id})`);
      return Promise.resolve(paths.data ?? '/d');
    },
    projectDir: () => {
      calls.push('projectDir()');
      return paths.project ?? '/p';
    },
  };
  return { host, calls };
}

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
  test('asks the host for the root of the plugin identifier as written, and for nothing else', async () => {
    const { host, calls } = recordingHost({ root: '/installed/formatter' });
    const result = await substitute(
      '"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh',
      NORMALIZED,
      scopeOf({ locations: host }),
    );
    expect(result.text).toBe('"/installed/formatter"/scripts/process.sh');
    expect(result.issues).toEqual([]);
    expect(calls).toEqual(['pluginRoot(formatter@acme-tools)']);
  });
  test('a path with spaces is written as is, one token, with no quoting added', async () => {
    const { host } = recordingHost({ root: '/Users/jo smith/plugins/my formatter' });
    const scope = scopeOf({ locations: host });
    expect((await substitute('"${CLAUDE_PLUGIN_ROOT}"/run', NORMALIZED, scope)).text).toBe(
      '"/Users/jo smith/plugins/my formatter"/run',
    );
    expect((await substitute('${CLAUDE_PLUGIN_ROOT}', NORMALIZED, scope)).text).toBe(
      '/Users/jo smith/plugins/my formatter',
    );
  });
  test('every occurrence is replaced, in one pass', async () => {
    const { host, calls } = recordingHost({ root: '/installed/formatter' });
    const result = await substitute(
      '${CLAUDE_PLUGIN_ROOT}/a ${CLAUDE_PLUGIN_ROOT}/b',
      NORMALIZED,
      scopeOf({ locations: host }),
    );
    expect(result.text).toBe('/installed/formatter/a /installed/formatter/b');
    expect(calls).toEqual(['pluginRoot(formatter@acme-tools)']);
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
  test('asks the host for the project directory, never for a plugin location', async () => {
    const { host, calls } = recordingHost({ project: '/Users/jo smith/my app' });
    const result = await substitute(
      '"${CLAUDE_PROJECT_DIR}"/x',
      NORMALIZED,
      scopeOf({ locations: host, pluginId: 'linter@acme-tools' }),
    );
    expect(result.text).toBe('"/Users/jo smith/my app"/x');
    expect(calls).toEqual(['projectDir()']);
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

describe('the data folder is asked for once per component (judgment)', () => {
  test('a stdio MCP server and a language server that write it and export it ask once each', async () => {
    const { host, calls } = recordingHost({ data: '/d' });
    const scope = scopeOf({ locations: host });
    await resolveMcpServer('db', { command: 'node', args: ['${CLAUDE_PLUGIN_DATA}/db'] }, scope);
    expect(calls.filter((call) => call.startsWith('pluginData'))).toHaveLength(1);
    calls.length = 0;
    const lsp = { command: '${CLAUDE_PLUGIN_DATA}/ls', extensionToLanguage: { '.go': 'go' } };
    await resolveLspServer('go', lsp, scope);
    expect(calls.filter((call) => call.startsWith('pluginData'))).toHaveLength(1);
  });

  test('a host that failed to answer is asked again on the next string', async () => {
    let attempts = 0;
    const host: Locations = {
      ...locations(),
      pluginData: () => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error('busy')) : Promise.resolve('/d');
      },
    };
    const run = substituter(scopeOf({ locations: host }));
    const failed = await run.run('${CLAUDE_PLUGIN_DATA}', NATIVE).then(
      () => 'answered',
      (error: unknown) => (error instanceof Error ? error.message : 'other'),
    );
    expect(failed).toBe('busy');
    expect((await run.run('${CLAUDE_PLUGIN_DATA}', NATIVE)).text).toBe('/d');
  });
});
