/**
 * plugins/manifest-reference.md § Where each variable resolves (the table), § Fields that run
 * through a shell, § Quoting and path separators; hooks.md § Exec form and shell form (exec form
 * takes `${user_config.*}` in `command` and each `args` element; shell form never does) and § Reference
 * scripts by path in PowerShell hooks; plugins/components.md § Monitors (path variables and
 * `${ENV_VAR}`, never `${user_config.*}`); mcp.md (`${VAR}` in `command`, `args`, `env`, `url`,
 * `headers`, not in `headersHelper`).
 *
 * Outside `spec(...)`: the `environment.component.*` ids are proven by the resolvers of each
 * component (hooks, MCP, LSP, monitors, content), which call these policies. These tests pin how
 * the policies drive substitution and the exported environment (the table's own rows are data,
 * not asserted here).
 */
import { describe, expect, test } from 'bun:test';
import {
  exportedEnvironment,
  SURFACE_POLICY,
  substituteSurface,
  type ResolvedUserConfig,
  type Surface,
  type SubstitutionScope,
} from '../../../src/loading/resolve/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { windowsLocations } from '../../support/windows-locations.ts';

const userConfig: ResolvedUserConfig = {
  declared: {
    webhook_url: { type: 'string', title: 'u', description: 'd' },
    api_token: { type: 'string', title: 't', description: 'd', sensitive: true },
  },
  values: { webhook_url: 'https://hooks.example.com', api_token: 's3cret' },
};
const scope: SubstitutionScope = {
  pluginId: 'formatter@acme-tools',
  locations: locations(),
  environment: fakeEnvironment({ NODE_ENV: 'test' }),
  userConfig,
  windows: false,
};
const text = async (surface: Surface, template: string, on = scope) =>
  (await substituteSurface(surface, template, on)).text;

describe('${user_config.KEY} per surface', () => {
  const template = 'send ${user_config.webhook_url} ${user_config.api_token}';
  test('exec-form hooks, MCP servers and LSP servers substitute it', async () => {
    for (const surface of ['hook-exec', 'mcp-stdio', 'mcp-remote', 'lsp'] as const) {
      expect(await text(surface, template)).toBe('send https://hooks.example.com s3cret');
    }
  });
  test('shell-form hooks (bash and PowerShell), monitors and headersHelper never do', async () => {
    for (const surface of [
      'hook-shell',
      'hook-powershell',
      'monitor-command',
      'mcp-headers-helper',
    ] as const) {
      expect(await text(surface, template)).toBe(template);
    }
  });
  test('skill, command and agent content substitutes non-sensitive values only', async () => {
    const result = await text('markdown-content', template);
    expect(result).toContain('https://hooks.example.com');
    expect(result).not.toContain('s3cret');
    expect(result).not.toContain('${user_config.api_token}');
  });
});

describe('${VAR} per surface', () => {
  test('MCP servers (stdio and remote) and monitors expand it', async () => {
    for (const surface of ['mcp-stdio', 'mcp-remote', 'monitor-command'] as const) {
      expect(await text(surface, '${NODE_ENV}')).toBe('test');
    }
  });
  test('where the docs do not give it (hooks, LSP, headersHelper, content) it is left to the process', async () => {
    for (const surface of [
      'hook-exec',
      'hook-shell',
      'lsp',
      'mcp-headers-helper',
      'markdown-content',
    ] as const) {
      expect(await text(surface, '${NODE_ENV}')).toBe('${NODE_ENV}');
    }
  });
});

describe('path separators per surface on Windows', () => {
  const windows: SubstitutionScope = { ...scope, locations: windowsLocations(), windows: true };
  test('exec-form hooks keep backslashes; PowerShell hooks get the ${env:} form; the rest use forward slashes', async () => {
    expect(await text('hook-exec', '${CLAUDE_PROJECT_DIR}', windows)).toBe('C:\\Users\\you\\app');
    expect(await text('hook-powershell', '${CLAUDE_PROJECT_DIR}', windows)).toBe(
      '${env:CLAUDE_PROJECT_DIR}',
    );
    for (const surface of ['hook-shell', 'monitor-command', 'mcp-stdio', 'lsp'] as const) {
      expect(await text(surface, '${CLAUDE_PROJECT_DIR}', windows)).toBe('C:/Users/you/app');
    }
  });
  test('every surface has a policy', () => {
    expect(Object.keys(SURFACE_POLICY).toSorted()).toEqual(
      [
        'hook-exec',
        'hook-powershell',
        'hook-shell',
        'lsp',
        'markdown-content',
        'mcp-headers-helper',
        'mcp-remote',
        'mcp-stdio',
        'monitor-command',
      ].toSorted(),
    );
  });
});

describe('exportedEnvironment', () => {
  test('a hook process gets the three path variables and an option variable per option', async () => {
    expect(await exportedEnvironment('hook-command', scope)).toEqual({
      CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
      CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
      CLAUDE_PROJECT_DIR: '/work/app',
      CLAUDE_PLUGIN_OPTION_WEBHOOK_URL: 'https://hooks.example.com',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 's3cret',
    });
  });
  test('MCP stdio and LSP processes get the three path variables, no option variables', async () => {
    const paths = {
      CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
      CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
      CLAUDE_PROJECT_DIR: '/work/app',
    };
    expect(await exportedEnvironment('mcp-stdio', scope)).toEqual(paths);
    expect(await exportedEnvironment('lsp', scope)).toEqual(paths);
  });
  test('monitors, remote MCP servers and content export nothing and ask the host for nothing', async () => {
    const host = locations();
    const quiet = { ...scope, locations: host };
    for (const component of ['monitor-command', 'mcp-remote', 'markdown-content'] as const) {
      expect(await exportedEnvironment(component, quiet)).toEqual({});
    }
    expect(host.dataCreated).toEqual([]);
  });
  test('a Windows host exports native paths', async () => {
    const windows: SubstitutionScope = { ...scope, locations: windowsLocations(), windows: true };
    expect((await exportedEnvironment('mcp-stdio', windows)).CLAUDE_PROJECT_DIR).toBe(
      'C:\\Users\\you\\app',
    );
  });
});
