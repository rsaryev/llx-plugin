/**
 * plugins/manifest-reference.md § Reference a saved value (`${user_config.KEY}` is "substituted in MCP
 * server config") and skills.md § Available string substitutions (one pass: a substituted value is
 * never scanned again, `substitute.ts`). The docs do not say how a bundled server's own settings
 * (plugins/components.md § Include a packaged MCPB server) join that pass: that they are answered in
 * the same single pass as every other reference, so a saved value is data, is a judgment
 * (spec/judgments.md), so every test here is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../../src/index.ts';
import { resolveMcpServers } from '../../../src/entry/loading.ts';
import { fakeBundles } from '../../support/mcp-bundle.ts';
import { json } from '../../support/plugin-folder.ts';
import { scopeOf } from '../../support/mcp-scope.ts';
import { fakeEnvironment, memoryFiles } from '../../support/ports.ts';

const bundles = fakeBundles({
  'db.mcpb': {
    name: 'database',
    server: {
      command: 'db-server',
      args: ['--token', '${user_config.token}', '--region', '${user_config.region}'],
    },
    userConfig: {
      token: { type: 'string', title: 'Token', description: '', required: true },
      region: { type: 'string', title: 'Region', description: '', default: '${DB_URL}' },
    },
  },
});

const PLUGIN = {
  '.claude-plugin/plugin.json': json({ name: 'my-plugin', mcpServers: './db.mcpb' }),
};

const resolvedArgs = async (saved: Readonly<Record<string, string>>) => {
  const { plugin } = await loadPlugin({ files: memoryFiles(PLUGIN), bundles });
  if (!plugin) throw new Error('the plugin did not load');
  const values = Object.fromEntries(
    Object.entries(saved).map(([key, value]) => [`database.${key}`, value]),
  );
  const scope = scopeOf({
    environment: fakeEnvironment({ HOME: '/home/u', DB_URL: 'postgres://db' }),
    userConfig: { declared: {}, values },
  });
  const { resolved } = await resolveMcpServers(plugin, scope);
  return resolved['database']?.server;
};

describe('judgment: a saved bundle value is data, never expanded again', () => {
  test('a saved value holding ${HOME}, ${CLAUDE_PLUGIN_ROOT} or ${user_config.region} stays that text', async () => {
    expect(await resolvedArgs({ token: '${HOME}', region: '${CLAUDE_PLUGIN_ROOT}' })).toMatchObject(
      {
        args: ['--token', '${HOME}', '--region', '${CLAUDE_PLUGIN_ROOT}'],
      },
    );
    expect(await resolvedArgs({ token: '${user_config.region}', region: 'eu' })).toMatchObject({
      args: ['--token', '${user_config.region}', '--region', 'eu'],
    });
  });

  test("a bundle setting's default is data too", async () => {
    expect(await resolvedArgs({ token: 'k' })).toMatchObject({
      args: ['--token', 'k', '--region', '${DB_URL}'],
    });
  });
});
