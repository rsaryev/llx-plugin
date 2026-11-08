/**
 * plugins/components.md § Install dependencies into the data directory: the `SessionStart` hook that
 * installs `node_modules` into `${CLAUDE_PLUGIN_DATA}` ("on first run and again after an update changes
 * `package.json`") and the MCP server that sets `NODE_PATH` to `${CLAUDE_PLUGIN_DATA}/node_modules`
 * in its `env`: both variables resolve in the places the page uses them.
 */
import { expect, test } from 'bun:test';
import { resolveMcpServer } from '../../../src/index.ts';
import { PATHS, hook, resolve } from '../../support/hook-scope.ts';
import { PATHS as MCP_PATHS, scopeOf } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

const INSTALL =
  'diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" >/dev/null 2>&1 || (cd "${CLAUDE_PLUGIN_DATA}" && cp "${CLAUDE_PLUGIN_ROOT}/package.json" . && npm install) || rm -f "${CLAUDE_PLUGIN_DATA}/package.json"';

spec('environment.components.Install dependencies into the data directory', () => {
  test('the install hook command resolves both variables, in the root and the data directory', async () => {
    const resolved = await resolve(hook({ command: INSTALL }));
    const command = resolved.spec.form === 'shell' ? resolved.spec.command : '';
    expect(command).toContain(`diff -q "${PATHS.CLAUDE_PLUGIN_ROOT}/package.json"`);
    expect(command).toContain(`cd "${PATHS.CLAUDE_PLUGIN_DATA}" && cp`);
    expect(command).not.toContain('${CLAUDE_PLUGIN');
  });

  test('an MCP server env sets NODE_PATH to the data directory node_modules', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'db',
      {
        command: 'node',
        args: ['${CLAUDE_PLUGIN_ROOT}/server.js'],
        env: { NODE_PATH: '${CLAUDE_PLUGIN_DATA}/node_modules' },
      },
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.server).toMatchObject({
      env: { NODE_PATH: `${MCP_PATHS.CLAUDE_PLUGIN_DATA}/node_modules` },
    });
  });
});
