/**
 * mcp.md § Use dynamic headers for custom authentication (the three variables, the 10 seconds, the
 * shell, the override, the OAuth rule), § Where the helper runs (the working directory per place the
 * server is configured), § Which variables a helper can read (the credential removal per place, the
 * pattern, the fixed list, `REDACTED` in the URL), § Trust a folder before its headersHelper runs
 * (project and local servers, agent files), errors.md § headersHelper not run (the notice).
 *
 * The plan is pure: it answers what to run, where, with which environment, or why not. Running the
 * command and the 401/403 retry are in headers-helper-run.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  HEADERS_HELPER_ORIGINS,
  planHeadersHelper,
  type HeadersHelperOrigin,
  type HeadersHelperPlan,
} from '../../../src/index.ts';
import { locations } from '../../support/ports.ts';
import {
  contextOf,
  DIRECTORIES,
  SNAPSHOT,
  serverOf,
  TRUSTED,
  trustOf,
} from '../../support/headers-helper.ts';
import { spec } from '../../support/spec.ts';

type Run = Extract<HeadersHelperPlan, { run: true }>;

const ran = (plan: HeadersHelperPlan): Run => {
  if (!plan.run) throw new Error('the helper did not run');
  return plan;
};

const has = (run: Run, name: string): boolean => Object.hasOwn(run.environment, name);

const planOf = (origin: HeadersHelperOrigin, overrides = {}) =>
  planHeadersHelper(serverOf(overrides), origin, TRUSTED, contextOf());

spec('mcp.behavior.Use dynamic headers for custom authentication', () => {
  test("the command is the server's headersHelper, run in a shell, under 10 seconds", () => {
    const run = ran(planOf('user', { headersHelper: 'echo \'{"Authorization": "Bearer x"}\'' }));
    expect(run.command).toBe('echo \'{"Authorization": "Bearer x"}\'');
    expect(run.timeoutMs).toBe(10_000);
  });

  test('a server without a headersHelper has no plan to run', () => {
    expect(planOf('user', { headersHelper: undefined })).toEqual({
      run: false,
      loaded: true,
      headersOnly: true,
    });
  });
});

spec(
  'mcp.behavior.Use dynamic headers for custom authentication.CLAUDE_CODE_MCP_SERVER_NAME',
  () => {
    test('CLAUDE_CODE_MCP_SERVER_NAME is the name of the server', () => {
      expect(ran(planOf('user')).environment.CLAUDE_CODE_MCP_SERVER_NAME).toBe('internal-api');
      expect(
        ran(planOf('project', { name: 'billing' })).environment.CLAUDE_CODE_MCP_SERVER_NAME,
      ).toBe('billing');
    });
  },
);

spec(
  'mcp.behavior.Use dynamic headers for custom authentication.CLAUDE_CODE_MCP_SERVER_URL',
  () => {
    test('CLAUDE_CODE_MCP_SERVER_URL is the URL of the server', () => {
      expect(ran(planOf('user')).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe(
        'https://mcp.internal.example.com',
      );
    });
  },
);

spec('mcp.behavior.Use dynamic headers for custom authentication.CLAUDE_PLUGIN_ROOT', () => {
  test('CLAUDE_PLUGIN_ROOT is the plugin root, set only when a plugin provides the server', () => {
    expect(ran(planOf('plugin')).environment.CLAUDE_PLUGIN_ROOT).toBe(DIRECTORIES.pluginRoot);
    for (const origin of ['user', 'project', 'local', 'managed', 'connector', 'sdk'] as const) {
      expect(ran(planOf(origin)).environment).not.toHaveProperty('CLAUDE_PLUGIN_ROOT');
    }
  });

  test('a plugin server in a host with no plugin root has none to give: it does not run', () => {
    const plan = planHeadersHelper(
      serverOf(),
      'plugin',
      TRUSTED,
      contextOf({ pluginRoot: undefined }),
    );
    expect(plan.run).toBe(false);
  });
});

spec('mcp.behavior.Where the helper runs.A plugin', () => {
  test("a plugin's helper runs in the plugin's root directory", () => {
    const run = ran(planOf('plugin'));
    expect(run.workingDirectory).toBe('plugin-root');
    expect(run.cwd).toBe(DIRECTORIES.pluginRoot);
  });
});

spec('mcp.behavior.Where the helper runs..mcp.json', () => {
  test('a project .mcp.json server and a local-scope server run in the project directory the server is declared in', () => {
    for (const origin of ['project', 'local'] as const) {
      const run = ran(planOf(origin));
      expect(run.workingDirectory).toBe('project-directory');
      expect(run.cwd).toBe(DIRECTORIES.project);
    }
  });

  test("the primary working directory does not move it: the declaring directory is the project's", () => {
    const plan = planHeadersHelper(
      serverOf(),
      'project',
      TRUSTED,
      contextOf({ primaryDirectory: '/elsewhere' }),
    );
    expect(ran(plan).cwd).toBe(DIRECTORIES.project);
  });
});

spec('mcp.behavior.Where the helper runs.mcpServers', () => {
  test('an agent file in the project, an SDK server and --mcp-config run in the primary working directory', () => {
    for (const origin of ['agent-project', 'sdk', 'mcp-config'] as const) {
      const run = ran(planOf(origin));
      expect(run.workingDirectory).toBe('primary-directory');
      expect(run.cwd).toBe(DIRECTORIES.primary);
    }
  });

  test('it follows the session when /cd moves the primary directory', () => {
    const moved = contextOf({ primaryDirectory: '/work/other' });
    expect(ran(planHeadersHelper(serverOf(), 'sdk', TRUSTED, moved)).cwd).toBe('/work/other');
  });

  test('user scope, managed MCP and connectors do not follow it', () => {
    const moved = contextOf({ primaryDirectory: '/work/other' });
    for (const origin of ['user', 'managed', 'connector'] as const) {
      expect(ran(planHeadersHelper(serverOf(), origin, TRUSTED, moved)).cwd).toBe(
        DIRECTORIES.config,
      );
    }
  });
});

spec('mcp.behavior.Where the helper runs.--add-dir', () => {
  test('user scope, managed MCP, a connector and an agent file from outside the project run in the configuration directory', () => {
    for (const origin of ['user', 'managed', 'connector', 'agent-user'] as const) {
      const run = ran(planOf(origin));
      expect(run.workingDirectory).toBe('config-directory');
      expect(run.cwd).toBe(DIRECTORIES.config);
    }
  });

  test('so does an agent file from an --add-dir directory (once that directory is trusted)', () => {
    const plan = planHeadersHelper(
      serverOf(),
      'agent-add-dir',
      trustOf({ key: '/extra' }),
      contextOf(),
    );
    expect(ran(plan).cwd).toBe(DIRECTORIES.config);
  });

  test('the configuration directory is CLAUDE_CONFIG_DIR when it is set, else ~/.claude', () => {
    const custom = contextOf({ environment: { ...SNAPSHOT, CLAUDE_CONFIG_DIR: '/cfg/claude' } });
    expect(ran(planHeadersHelper(serverOf(), 'user', TRUSTED, custom)).cwd).toBe('/cfg/claude');
    const home = contextOf({ locations: locations({ home: '/Users/me' }) });
    expect(ran(planHeadersHelper(serverOf(), 'user', TRUSTED, home)).cwd).toBe('/Users/me/.claude');
  });
});

describe('where the helper runs, in places the page leaves open (judgment)', () => {
  test('an agent from managed settings or --agents is outside the project: configuration directory', () => {
    for (const origin of ['agent-managed', 'agent-flag'] as const) {
      expect(ran(planOf(origin)).workingDirectory).toBe('config-directory');
    }
  });

  test('every origin has a plan', () => {
    for (const origin of HEADERS_HELPER_ORIGINS) {
      expect(planHeadersHelper(serverOf(), origin, TRUSTED, contextOf()).run).toBe(true);
    }
  });
});

spec('mcp.behavior.Which variables a helper can read', () => {
  test('removed for a project .mcp.json, a plugin and an inline agent server from the project or an --add-dir directory', () => {
    for (const origin of ['project', 'plugin', 'agent-project', 'agent-add-dir'] as const) {
      const run = ran(planHeadersHelper(serverOf(), origin, trustOf(), contextOf()));
      expect(run.removesCredentials).toBe(true);
      expect(has(run, 'ANTHROPIC_API_KEY')).toBe(false);
      expect(has(run, 'MY_REGISTRY_TOKEN')).toBe(false);
    }
  });

  test('not removed for user, local, managed, connector, SDK, --mcp-config and an inline agent server from ~/.claude/agents, managed settings or --agents', () => {
    for (const origin of [
      'user',
      'local',
      'managed',
      'connector',
      'sdk',
      'mcp-config',
      'agent-user',
      'agent-managed',
      'agent-flag',
    ] as const) {
      const run = ran(planOf(origin));
      expect(run.removesCredentials).toBe(false);
      expect(run.environment.ANTHROPIC_API_KEY).toBe('sk-ant-live');
      expect(run.environment.MY_REGISTRY_TOKEN).toBe('tok-live-123');
    }
  });

  test('the pattern is TOKEN, SECRET, PASSWORD, KEY or AUTH in either letter case, so ANTHROPIC_API_KEY and MY_REGISTRY_TOKEN go together with db_password', () => {
    const run = ran(planOf('plugin'));
    expect(has(run, 'db_password')).toBe(false);
    expect(has(run, 'MY_REGISTRY_TOKEN')).toBe(false);
  });

  test('Git GIT_CONFIG_KEY_<n> is the exception and stays', () => {
    expect(ran(planOf('plugin')).environment.GIT_CONFIG_KEY_0).toBe('http.extraheader');
  });

  test('a fixed list removes credentials whose names do not follow the pattern: ANTHROPIC_CUSTOM_HEADERS', () => {
    expect(has(ran(planOf('plugin')), 'ANTHROPIC_CUSTOM_HEADERS')).toBe(false);
    expect(ran(planOf('user')).environment.ANTHROPIC_CUSTOM_HEADERS).toBe('X-Custom: secret');
  });

  test('every other variable is inherited as it is', () => {
    const run = ran(planOf('plugin'));
    expect(run.environment.PATH).toBe('/bin');
    expect(run.environment.TEAM).toBe('blue');
  });

  test('the URL the helper receives has the live value of a removed variable replaced with REDACTED', () => {
    const url = 'https://registry.example.com/mcp?token=tok-live-123&team=blue';
    const run = ran(planOf('project', { url }));
    expect(run.environment.CLAUDE_CODE_MCP_SERVER_URL).toBe(
      'https://registry.example.com/mcp?token=REDACTED&team=blue',
    );
  });

  test("only the removed variable's part is replaced; a URL that carries none is given whole", () => {
    expect(ran(planOf('plugin')).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe(
      'https://mcp.internal.example.com',
    );
    const kept = ran(planOf('project', { url: 'https://h.test/?team=blue' }));
    expect(kept.environment.CLAUDE_CODE_MCP_SERVER_URL).toBe('https://h.test/?team=blue');
  });

  test('where the variables are not removed the URL is not redacted', () => {
    const url = 'https://registry.example.com/mcp?token=tok-live-123';
    expect(ran(planOf('user', { url })).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe(url);
  });
});
