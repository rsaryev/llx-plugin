/** plugins/manifest-reference.md § Reference a saved value (all five consumer surfaces and hook environment). */
import { expect, test } from 'bun:test';
import {
  resolveMcpServer,
  resolveLspServer,
  resolveHookCommand,
  substituteContent,
} from '../../../src/loading/resolve/index.ts';
import { scopeOf } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

spec('userConfig.rule.Reference a saved value', () => {
  test('MCP, LSP and exec args receive saved values; skill and agent content redact secrets', async () => {
    const scope = scopeOf();
    const reference = '${user_config.region}:${user_config.api_token}';
    const mcp = await resolveMcpServer('api', { command: 'server', args: [reference] }, scope);
    expect(mcp.resolved?.server).toMatchObject({ args: ['eu:s3cret'] });
    expect(mcp.issues).toEqual([]);
    const lsp = await resolveLspServer(
      'lang',
      { command: 'server', args: [reference], extensionToLanguage: { '.x': 'x' } },
      scope,
    );
    expect(lsp.resolved.args).toEqual(['eu:s3cret']);
    expect(lsp.issues).toEqual([]);
    const hook = await resolveHookCommand(
      { type: 'command', command: 'server', args: [reference] },
      scope,
    );
    expect(hook.resolved?.spec).toEqual({ form: 'exec', command: 'server', args: ['eu:s3cret'] });
    expect(hook.resolved?.environment).toMatchObject({
      CLAUDE_PLUGIN_OPTION_REGION: 'eu',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 's3cret',
    });
    for (const path of ['skills/review/SKILL.md', 'agents/review.md']) {
      const content = await substituteContent(reference, scope, path);
      expect(content.text).toStartWith('eu:');
      expect(content.text).not.toContain('${user_config.api_token}');
      expect(content.issues).toEqual([]);
      expect(content.text).not.toContain('s3cret');
    }
    const shell = await resolveHookCommand(
      { type: 'command', command: 'echo "$CLAUDE_PLUGIN_OPTION_API_TOKEN"' },
      scope,
    );
    expect(shell.resolved?.environment.CLAUDE_PLUGIN_OPTION_API_TOKEN).toBe('s3cret');
  });
});
