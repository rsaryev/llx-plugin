/**
 * plugins/components.md § Include a packaged MCPB server ("A bundle's own manifest can declare settings
 * the server needs from the user in a `user_config` block"; "A bundled server with a required setting
 * that has no saved value doesn't start"), plugins/manifest-reference.md § Reference a saved value
 * (`${user_config.KEY}` is "substituted in MCP server config") and settings-reference.md § pluginConfigs
 * (an optional `mcpServers` field "holding per-server user configuration values"). The docs do not say
 * which settings a bundled server's `${user_config.KEY}` reads, nor whether an empty text is a saved
 * value: that it reads its bundle's own (the plugin's saved values under `<server>.<key>`, the
 * `--config` form), then the bundle's default, as a plugin option does, that the verdict is made when
 * the server is resolved, and that an empty text is none, are judgments (spec/judgments.md), so every
 * test here is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../../src/index.ts';
import { resolveMcpServers } from '../../../src/entry/loading.ts';
import { fakeBundles } from '../../support/mcp-bundle.ts';
import { json } from '../../support/plugin-folder.ts';
import { scopeOf } from '../../support/mcp-scope.ts';
import type { UserConfigValue } from '../../../src/loading/resolve/index.ts';
import { memoryFiles } from '../../support/ports.ts';

/** A bundle whose server reads `token`, `region` and `log` of its own `user_config`, as the MCPB manifest wrote them. */
const bundles = fakeBundles({
  'db.mcpb': {
    name: 'database',
    server: {
      command: 'db-server',
      args: ['--region', '${user_config.region}'],
      env: {
        DB_TOKEN: '${user_config.token}',
        ROOT: '${CLAUDE_PLUGIN_ROOT}',
        LOG: '${user_config.log}',
      },
    },
    userConfig: {
      token: { type: 'string', title: 'Token', description: '', required: true, sensitive: true },
      region: { type: 'string', title: 'Region', description: '', required: true, default: 'us' },
      log: { type: 'string', title: 'Log', description: '' },
    },
  },
});

/** The plugin declares options of the same keys: a bundled server never reads them. */
const PLUGIN = {
  '.claude-plugin/plugin.json': json({
    name: 'my-plugin',
    mcpServers: './db.mcpb',
    userConfig: {
      token: { type: 'string', title: 't', description: 'd' },
      region: { type: 'string', title: 'r', description: 'd' },
    },
  }),
};

const DECLARED = {
  token: { type: 'string', title: 't', description: 'd' },
  region: { type: 'string', title: 'r', description: 'd' },
  log: { type: 'string', title: 'l', description: 'd' },
} as const;

const PLUGIN_OPTIONS = { token: 'plugin-token', region: 'plugin-region', log: 'plugin-log' };

/** The plugin loads once, with no saved values; each resolve passes the values of its own session. */
const loaded = await loadPlugin({ files: memoryFiles(PLUGIN), bundles });

const resolve = async (saved: Readonly<Record<string, UserConfigValue>>) => {
  if (!loaded.plugin) throw new Error('the plugin did not load');
  const values = Object.fromEntries(
    Object.entries(saved).map(([key, value]) => [`database.${key}`, value]),
  );
  const scope = scopeOf({
    userConfig: { declared: DECLARED, values: { ...PLUGIN_OPTIONS, ...values } },
  });
  const done = await resolveMcpServers(loaded.plugin, scope);
  return { server: done.resolved['database']?.server, issues: done.issues };
};

const NEEDS = 'Bundled MCP server "database" was not started: it needs configuration';

describe("judgment: a bundled server's ${user_config.KEY} reads its bundle's own saved settings", () => {
  test('the saved value of the bundle setting is substituted, not the plugin option of the same key', async () => {
    const { server } = await resolve({ token: 'bundle-token', region: 'eu' });
    expect(loaded.issues.filter((found) => found.severity === 'error')).toEqual([]);
    expect(server).toMatchObject({
      command: 'db-server',
      args: ['--region', 'eu'],
      env: { DB_TOKEN: 'bundle-token', ROOT: '/plugins/my-plugin@acme-tools' },
    });
  });

  test('a setting with no saved value takes the bundle default; one with neither stays as written, with the warning a plugin option gets', async () => {
    const { server, issues } = await resolve({ token: 'k' });
    expect(server).toMatchObject({
      args: ['--region', 'us'],
      env: { DB_TOKEN: 'k', LOG: '${user_config.log}' },
    });
    expect(issues.map((found) => found.message)).toEqual(['${user_config.log} has no value']);
  });

  test('a number or boolean saved value is written as text; a list counts as none', async () => {
    const { server } = await resolve({ token: 7, region: true, log: ['a', 'b'] });
    expect(server).toMatchObject({
      args: ['--region', 'true'],
      env: { DB_TOKEN: '7', LOG: '${user_config.log}' },
    });
  });

  test('with no saved value for a required setting the server does not start when resolved; the load reported nothing', async () => {
    const { server, issues } = await resolve({});
    expect(server).toBeUndefined();
    expect(issues.map((found) => found.message)).toEqual([NEEDS]);
    expect(loaded.plugin?.mcpBundles['database']?.userConfig['token']).toMatchObject({
      title: 'Token',
      sensitive: true,
    });
  });
});

describe('judgment: an empty text is no saved value for a required bundle setting', () => {
  test('a required setting saved as empty text keeps the server from starting', async () => {
    const { server, issues } = await resolve({ token: '' });
    expect(server).toBeUndefined();
    expect(issues.map((found) => found.message)).toEqual([NEEDS]);
  });
});
