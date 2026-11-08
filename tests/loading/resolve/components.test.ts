/**
 * plugins/manifest-reference.md § Where each variable resolves (the table), § Fields that run
 * through a shell, § Quoting and path separators; hooks.md § Exec form and shell form (exec form
 * takes `${user_config.*}` in `command` and each `args` element; shell form never does) and § Reference
 * scripts by path in PowerShell hooks; plugins/components.md § Monitors (path variables and
 * `${ENV_VAR}`, never `${user_config.*}`); mcp.md (`${VAR}` in `command`, `args`, `env`, `url`,
 * `headers`, not in `headersHelper`).
 *
 * The `environment.component.*` ids are proven here, one `spec(...)` per row of the table: its
 * "Fields where `${...}` resolves" column (`VARIABLE_FIELDS`) and its "Exported to the process"
 * column (`exportedEnvironment`). The surface policies below (`${user_config.*}`, `${VAR}`, path
 * separators) are asserted outside `spec(...)`: no id names them, the resolvers of each component
 * call them.
 */
import { describe, expect, test } from 'bun:test';
import {
  exportedEnvironment,
  SURFACE_POLICY,
  substituteSurface,
  VARIABLE_FIELDS,
  type ResolvedUserConfig,
  type Surface,
  type VariableComponent,
  type SubstitutionScope,
} from '../../../src/loading/resolve/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
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

const PATHS = {
  CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
  CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
  CLAUDE_PROJECT_DIR: '/work/app',
};

/** What a row of the table proves: where `${...}` resolves and what the process receives. */
const rowOf = async (component: VariableComponent) => {
  const host = locations();
  const exported = await exportedEnvironment(component, { ...scope, locations: host });
  return { fields: VARIABLE_FIELDS[component].fields, exported, host };
};

spec('environment.component.Hook commands', () => {
  test('resolves anywhere in command and args', async () => {
    expect((await rowOf('hook-command')).fields).toEqual(['command', 'args']);
  });
  test('the process gets the three path variables and an option variable per option', async () => {
    expect((await rowOf('hook-command')).exported).toEqual({
      ...PATHS,
      CLAUDE_PLUGIN_OPTION_WEBHOOK_URL: 'https://hooks.example.com',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 's3cret',
    });
  });
});

spec('environment.component.Monitor commands', () => {
  test('resolves anywhere in command', async () => {
    expect((await rowOf('monitor-command')).fields).toEqual(['command']);
  });
  test('nothing is exported, and the host is asked for nothing', async () => {
    const { exported, host } = await rowOf('monitor-command');
    expect(exported).toEqual({});
    expect(host.dataCreated).toEqual([]);
  });
});

spec('environment.component.stdio', () => {
  test('resolves in command, args and env', async () => {
    expect((await rowOf('mcp-stdio')).fields).toEqual(['command', 'args', 'env']);
  });
  test('the process gets the three path variables, no option variables', async () => {
    expect((await rowOf('mcp-stdio')).exported).toEqual(PATHS);
  });
});

spec('environment.component.http', () => {
  test('http, sse and ws resolve in url, headers and headersHelper', async () => {
    expect((await rowOf('mcp-remote')).fields).toEqual(['url', 'headers', 'headersHelper']);
  });
  test('the process variables are not applicable: nothing is exported, the host is not asked', async () => {
    const { exported, host } = await rowOf('mcp-remote');
    expect(exported).toEqual({});
    expect(host.dataCreated).toEqual([]);
  });
});

spec('environment.component.LSP servers', () => {
  test('resolves in command, args, env and workspaceFolder', async () => {
    expect((await rowOf('lsp')).fields).toEqual(['command', 'args', 'env', 'workspaceFolder']);
  });
  test('the process gets the three path variables, no option variables', async () => {
    expect((await rowOf('lsp')).exported).toEqual(PATHS);
  });
});

spec('environment.component.Skill, command, and agent content', () => {
  test('resolves anywhere in the Markdown body', async () => {
    expect((await rowOf('markdown-content')).fields).toEqual(['body']);
  });
  test('the process variables are not applicable: nothing is exported, the host is not asked', async () => {
    const { exported, host } = await rowOf('markdown-content');
    expect(exported).toEqual({});
    expect(host.dataCreated).toEqual([]);
  });
});

describe('exportedEnvironment (judgments)', () => {
  test('a hook, stdio or LSP process always gets the data folder created, referenced or not', async () => {
    for (const component of ['hook-command', 'mcp-stdio', 'lsp'] as const) {
      const host = locations();
      await exportedEnvironment(component, { ...scope, locations: host });
      expect(host.dataCreated).toEqual(['formatter-acme-tools']);
    }
  });
  test('a Windows host exports native paths', async () => {
    const windows: SubstitutionScope = { ...scope, locations: windowsLocations(), windows: true };
    expect((await exportedEnvironment('mcp-stdio', windows)).CLAUDE_PROJECT_DIR).toBe(
      'C:\\Users\\you\\app',
    );
  });
});

describe('extra variables (judgment)', () => {
  const withExtra: SubstitutionScope = {
    ...scope,
    extra: { CLAUDE_SKILL_DIR: '/plugins/p/skills/a', NODE_ENV: 'from-extra' },
  };
  test('are substituted on every surface, shell forms included, and win over ${VAR}', async () => {
    for (const surface of [
      'hook-exec',
      'hook-shell',
      'hook-powershell',
      'monitor-command',
      'mcp-stdio',
      'mcp-remote',
      'mcp-headers-helper',
      'lsp',
      'markdown-content',
    ] as const) {
      expect(await text(surface, '${CLAUDE_SKILL_DIR}/x ${NODE_ENV}', withExtra)).toBe(
        '/plugins/p/skills/a/x from-extra',
      );
    }
  });
});

describe('credential variables in a remote MCP server', () => {
  const secrets = fakeEnvironment({
    ANTHROPIC_API_KEY: 'sk-1',
    ANTHROPIC_AUTH_TOKEN: 'tok-2',
    AWS_BEARER_TOKEN_BEDROCK: 'aws-3',
    HTTPS_PROXY: 'http://user:pw@proxy',
    NPM_TOKEN: 'npm-4',
    ANTHROPIC_BASE_URL: 'https://gateway.example.com',
    API_KEY: 'plain-5',
  });
  const remote = { ...scope, environment: secrets };
  test('the covered names read as empty in url and headers, set or not, a default ignored', async () => {
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'AWS_BEARER_TOKEN_BEDROCK',
      'HTTPS_PROXY',
      'NPM_TOKEN',
    ]) {
      expect(await text('mcp-remote', `Bearer \${${name}}`, remote)).toBe('Bearer ');
      expect(await text('mcp-remote', `Bearer \${${name}:-fallback}`, remote)).toBe('Bearer ');
      expect(await text('mcp-remote', `Bearer \${${name}}`, scope)).toBe('Bearer ');
    }
  });
  test('a provider base URL and a name outside the set expand', async () => {
    expect(await text('mcp-remote', '${ANTHROPIC_BASE_URL}/mcp', remote)).toBe(
      'https://gateway.example.com/mcp',
    );
    expect(await text('mcp-remote', 'Key ${API_KEY}', remote)).toBe('Key plain-5');
  });
  test('a stdio server expands them: the rule is for a remote url and headers', async () => {
    expect(await text('mcp-stdio', '${NPM_TOKEN}', remote)).toBe('npm-4');
  });
});
