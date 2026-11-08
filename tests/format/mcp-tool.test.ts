/**
 * mcp.md § Tools with names longer than 128 characters (the tool is left out; errors.md § MCP tool
 * name over 128 characters quotes the debug line), § Require approval for a specific tool
 * (`_meta["anthropic/requiresUserInteraction"]` is the JSON Boolean `true`), § Mark tools that are safe
 * to call twice (`idempotentHint`, `readOnlyHint`), § Raise the limit for a specific tool
 * (`_meta["anthropic/maxResultSizeChars"]`, a ceiling of 500,000 characters), § Plugin-provided MCP
 * servers and plugins/components.md § Server names, tool names, and reloads (the callable names).
 * The schema sections are in mcp-tool-schema.test.ts. Wording the docs do not quote is a judgment and
 * is asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  MCP_TOOL_NAME_LIMIT,
  mcpPromptToolAnswer,
  mcpToolName,
  mcpToolSendCheck,
  pluginMcpServerName,
  readMcpToolHints,
  requiringInteraction,
} from '../../src/index.ts';
import { decision, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('mcp.behavior.Tools with names longer than 128 characters', () => {
  const server = 'analytics-database';

  test('the limit is 128 characters of the full name mcp__<server>__<tool>', () => {
    expect(MCP_TOOL_NAME_LIMIT).toBe(128);
    const padding = 128 - mcpToolName(server, '').length;
    const atLimit = mcpToolName(server, 'x'.repeat(padding));
    expect(atLimit).toHaveLength(128);
    expect(mcpToolSendCheck(atLimit)).toEqual({ sent: true });
  });

  test('a tool whose full name is over 128 characters is left out, with the line errors.md quotes', () => {
    const name = mcpToolName(server, 'x'.repeat(200));
    const check = mcpToolSendCheck(name);
    expect(check).toEqual({
      sent: false,
      log: `Tool "${name}" is not sent to Claude: its name has ${name.length} characters and the API accepts at most 128`,
    });
  });

  test('the server name is part of the count: the same tool is sent under a short server name and left out under a long one', () => {
    const tool = 'x'.repeat(110);
    expect(mcpToolSendCheck(mcpToolName('db', tool)).sent).toBe(true);
    expect(mcpToolSendCheck(mcpToolName('analytics-database', tool)).sent).toBe(false);
  });

  test('a plugin server counts the plugin name too: mcp__plugin_<plugin>_<server>__<tool>', () => {
    const tool = 'q'.repeat(90);
    const plain = mcpToolName('db', tool);
    const viaPlugin = mcpToolName(pluginMcpServerName('my-plugin-with-a-long-name', 'db'), tool);
    expect(plain.length).toBeLessThanOrEqual(128);
    expect(viaPlugin.length).toBeGreaterThan(128);
    expect(mcpToolSendCheck(viaPlugin).sent).toBe(false);
  });

  test('characters count as the API counts them: by code unit of the name, not by byte', () => {
    const name = `mcp__s__${'é'.repeat(120)}`;
    expect(name.length).toBe(128);
    expect(mcpToolSendCheck(name).sent).toBe(true);
  });
});

spec('mcp.behavior.Mark tools that are safe to call twice', () => {
  test('the docs example: idempotentHint true marks set_issue_status as safe to repeat', () => {
    const hints = readMcpToolHints({
      name: 'set_issue_status',
      annotations: { idempotentHint: true },
    });
    expect(hints.idempotent).toBe(true);
    expect(hints.readOnly).toBe(false);
    expect(hints.safeToRepeat).toBe(true);
  });

  test('readOnlyHint true also marks it, and also runs the tool in parallel with other read-only calls', () => {
    const hints = readMcpToolHints({ name: 'list', annotations: { readOnlyHint: true } });
    expect(hints.readOnly).toBe(true);
    expect(hints.safeToRepeat).toBe(true);
    expect(hints.parallelWithReadOnly).toBe(true);
    expect(readMcpToolHints({ annotations: { idempotentHint: true } }).parallelWithReadOnly).toBe(
      false,
    );
  });

  test('only the value true marks a tool: false, the text "true", 1 and a missing annotation do not', () => {
    for (const value of [false, 'true', 1, null, undefined, {}]) {
      for (const hint of ['idempotentHint', 'readOnlyHint']) {
        const hints = readMcpToolHints({ name: 't', annotations: { [hint]: value } });
        expect(hints.safeToRepeat).toBe(false);
      }
    }
    expect(readMcpToolHints({ name: 't' }).safeToRepeat).toBe(false);
    expect(readMcpToolHints({ name: 't', annotations: 'x' }).safeToRepeat).toBe(false);
  });

  test('the hints are read from the annotations of the tools/list entry, not from _meta', () => {
    expect(readMcpToolHints({ _meta: { idempotentHint: true } }).safeToRepeat).toBe(false);
  });
});

spec('mcp.behavior.Raise the limit for a specific tool', () => {
  const entry = (value: unknown) => ({
    name: 'get_schema',
    description: 'Returns the full database schema',
    _meta: { 'anthropic/maxResultSizeChars': value },
  });

  test('the docs example: 200000 is that tool threshold', () => {
    expect(readMcpToolHints(entry(200_000)).maxResultSizeChars).toBe(200_000);
  });

  test('"up to a hard ceiling of 500,000 characters"', () => {
    expect(readMcpToolHints(entry(500_000)).maxResultSizeChars).toBe(500_000);
    expect(readMcpToolHints(entry(9_000_000)).maxResultSizeChars).toBe(500_000);
  });

  test('a tool without the annotation declares no limit', () => {
    expect(readMcpToolHints({ name: 'x' }).maxResultSizeChars).toBeUndefined();
    expect(readMcpToolHints({ name: 'x', _meta: {} }).maxResultSizeChars).toBeUndefined();
  });

  test('the key is read from _meta only, not from annotations or the top level of the entry', () => {
    const wrong = {
      name: 'x',
      'anthropic/maxResultSizeChars': 200_000,
      annotations: { 'anthropic/maxResultSizeChars': 200_000 },
    };
    expect(readMcpToolHints(wrong).maxResultSizeChars).toBeUndefined();
  });
});

spec('mcp.behavior.Require approval for a specific tool', () => {
  const flagged = (value: unknown) =>
    readMcpToolHints({
      name: 'grant_access',
      description: 'Requests access to a protected resource',
      _meta: { 'anthropic/requiresUserInteraction': value },
    }).requiresUserInteraction;

  test('"The value must be the JSON Boolean true; any other value is ignored"', () => {
    expect(flagged(true)).toBe(true);
    for (const value of [false, 'true', 1, 'yes', null, [], {}, undefined]) {
      expect(flagged(value)).toBe(false);
    }
  });

  test('the permission rule name of the tool is mcp__<server>__<tool>', () => {
    const names = requiringInteraction('access', [
      { name: 'grant_access', _meta: { 'anthropic/requiresUserInteraction': true } },
      { name: 'list_access' },
    ]);
    expect([...names]).toEqual(['mcp__access__grant_access']);
  });

  test('a plugin server is named with the plugin in its tool names', () => {
    const server = pluginMcpServerName('my-plugin', 'access');
    const names = requiringInteraction(server, [
      { name: 'grant', _meta: { 'anthropic/requiresUserInteraction': true } },
    ]);
    expect([...names]).toEqual(['mcp__plugin_my-plugin_access__grant']);
  });

  const call = (mode: Parameters<typeof decision>[0], rules = rulesOf()) =>
    decision(
      mode,
      'mcp__access__grant_access',
      {},
      {
        rules,
        requiresUserInteraction: requiringInteraction('access', [
          { name: 'grant_access', _meta: { 'anthropic/requiresUserInteraction': true } },
        ]),
        autoAvailable: true,
        bypassAvailable: true,
      },
    );

  test('the prompt shows on every call, even in acceptEdits, auto and bypassPermissions', () => {
    for (const mode of ['default', 'acceptEdits', 'auto', 'bypassPermissions'] as const) {
      expect(call(mode)).toEqual({ outcome: 'ask', reason: 'requires-user-interaction' });
    }
  });

  test('allow rules that match the tool do not skip the prompt', () => {
    const rules = rulesOf(['allow', 'mcp__access__grant_access'], ['allow', 'mcp__access']);
    for (const mode of ['default', 'acceptEdits', 'auto', 'bypassPermissions'] as const) {
      expect(call(mode, rules)).toEqual({ outcome: 'ask', reason: 'requires-user-interaction' });
    }
  });

  test('in dontAsk mode, which never prompts, the call is denied', () => {
    expect(call('dontAsk')).toEqual({ outcome: 'deny', reason: 'requires-user-interaction' });
  });

  test('other tools of the same server keep their normal permission behaviour', () => {
    const rules = rulesOf(['allow', 'mcp__access__list_access']);
    const other = decision(
      'default',
      'mcp__access__list_access',
      {},
      {
        rules,
        requiresUserInteraction: requiringInteraction('access', [
          { name: 'grant_access', _meta: { 'anthropic/requiresUserInteraction': true } },
        ]),
      },
    );
    expect(other).toEqual({ outcome: 'allow', reason: 'allow-rule' });
  });

  test('--permission-prompt-tool: an allow result for a flagged tool becomes a deny with the quoted message', () => {
    expect(mcpPromptToolAnswer(true, { behavior: 'allow' })).toEqual({
      behavior: 'deny',
      message: 'MCP tool requires user interaction; not supported via --permission-prompt-tool',
    });
    expect(mcpPromptToolAnswer(true, { behavior: 'deny', message: 'no' })).toEqual({
      behavior: 'deny',
      message: 'no',
    });
    expect(mcpPromptToolAnswer(false, { behavior: 'allow' })).toEqual({ behavior: 'allow' });
  });
});

describe('what the docs leave open', () => {
  test('a limit that is no positive number is no limit; a fraction is cut to a whole number', () => {
    const limit = (value: unknown) =>
      readMcpToolHints({ _meta: { 'anthropic/maxResultSizeChars': value } }).maxResultSizeChars;
    for (const value of [0, -5, Number.NaN, '200000', null, Number.POSITIVE_INFINITY]) {
      expect(limit(value)).toBeUndefined();
    }
    expect(limit(1500.9)).toBe(1500);
  });

  test('an entry that is not an object has no hints', () => {
    for (const entry of [null, 'tool', 5, []]) {
      expect(readMcpToolHints(entry)).toEqual({
        readOnly: false,
        idempotent: false,
        safeToRepeat: false,
        parallelWithReadOnly: false,
        requiresUserInteraction: false,
      });
    }
  });
});
