/**
 * plugins/troubleshooting.md § ${CLAUDE_PLUGIN_ROOT} shows forward slashes on Windows.
 * String substitution uses forward slashes; the process environment retains the native path.
 */
import { expect, test } from 'bun:test';
import { substituteContent, resolveHookCommand } from '../../../src/loading/resolve/index.ts';
import { scopeOf } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

spec('manifest.troubleshooting.${CLAUDE_PLUGIN_ROOT} shows forward slashes on Windows', () => {
  test('a native Windows root is normalized in interpolated text and native in the environment', async () => {
    const scope = scopeOf();
    const windows = {
      ...scope,
      windows: true,
      locations: { ...scope.locations, pluginRoot: () => String.raw`C:\Plugins\my-tool` },
    };
    expect(
      (await substituteContent('${CLAUDE_PLUGIN_ROOT}/scripts/run.ps1', windows, 'SKILL.md')).text,
    ).toBe('C:/Plugins/my-tool/scripts/run.ps1');
    const hook = await resolveHookCommand({ type: 'command', command: 'run' }, windows);
    expect(hook.resolved?.environment['CLAUDE_PLUGIN_ROOT']).toBe(String.raw`C:\Plugins\my-tool`);
  });
});
