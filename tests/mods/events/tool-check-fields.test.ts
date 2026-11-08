/**
 * The fields of `tool.check` a hook reads. plugins/mods/events.md § Check whether a tool call is
 * read-only; plugins/mods/reference.md § Tools ("Agent and organization fields on `tool.check`" and
 * "The `e.isReadOnly` field on `tool.check`"). The tool's own report is the host's: the tests fire
 * `tool.check` through the chain with the field the host would set.
 */

import { describe, expect, test } from 'bun:test';
import {
  eventInputProblem,
  mergeToolCheck,
  toolReadOnlyReport,
} from '../../../src/mods/events/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import { bash as decideBash } from '../../support/decide.ts';
import { spec } from '../../support/spec.ts';

const check = { tool: 'Bash', input: { command: 'git push origin main' } };

describe('check whether a tool call is read-only', () => {
  /** The checks of the host: Bash through the kit's read-only command check, MCP by the server's hint. */
  const checks = (hints: Record<string, boolean> = {}) => ({
    bashCommand: (command: string) => decideBash('default', command).reason === 'read-only-command',
    mcpReadOnlyHint: (tool: string) => hints[tool],
  });
  const report = (tool: string, input: Record<string, unknown>, hints?: Record<string, boolean>) =>
    toolReadOnlyReport({ tool, input }, checks(hints));

  spec('mods.events.Check whether a tool call is read-only', () => {
    test('Read, Grep, Glob and WebSearch report every call as read-only', () => {
      for (const tool of ['Read', 'Grep', 'Glob', 'WebSearch']) {
        expect(report(tool, {})).toBe(true);
      }
    });

    test('WebFetch and Agent calls report as read-only, though one requests a URL and the other starts a subagent', () => {
      expect(report('WebFetch', { url: 'https://example.com' })).toBe(true);
      expect(report('Agent', { prompt: 'run the tests' })).toBe(true);
    });

    test('Bash reports a command that passes the built-in read-only command check, and no other', () => {
      expect(report('Bash', { command: 'ls -la' })).toBe(true);
      expect(report('Bash', { command: 'git status' })).toBe(true);
      expect(report('Bash', { command: 'rm -rf build' })).toBeUndefined();
      expect(report('Bash', { command: 'ls && npm install' })).toBeUndefined();
      expect(report('Bash', {})).toBeUndefined();
    });

    test('an MCP tool reports when the server sets its readOnlyHint annotation to true', () => {
      const hints = { mcp__github__get_issue: true, mcp__github__create_issue: false };
      expect(report('mcp__github__get_issue', {}, hints)).toBe(true);
      expect(report('mcp__github__create_issue', {}, hints)).toBeUndefined();
      expect(report('mcp__github__unannotated', {}, hints)).toBeUndefined();
    });

    test('the field is true or absent, never false: false does not fit the event', () => {
      expect(eventInputProblem('tool.check', { ...check, isReadOnly: true })).toBeUndefined();
      expect(eventInputProblem('tool.check', { ...check, isReadOnly: false })).toContain(
        'tool.check input: isReadOnly',
      );
    });

    test('the example hook asks for every mcp__github__ call that is not read-only and was not denied', async () => {
      const h = eventHarness();
      h.mod('github-guard', 'user', [
        fn(
          'tool.check',
          async (_$, e, next) => {
            const decided = record(await next(e));
            if (e.isReadOnly || decided.decision === 'deny') return decided;
            return { decision: 'ask', reason: 'This tool can change the GitHub repository' };
          },
          { matcher: { tool: /^mcp__github__/ } },
        ),
      ]);
      const hints = { mcp__github__get_issue: true };
      const fire = (tool: string, decision: string) =>
        h.fire(
          'tool.check',
          {
            tool,
            input: {},
            ...(toolReadOnlyReport({ tool, input: {} }, checks(hints)) ? { isReadOnly: true } : {}),
          },
          { core: () => Promise.resolve({ decision }) },
        );
      expect(await fire('mcp__github__get_issue', 'allow')).toEqual({ decision: 'allow' });
      expect(await fire('mcp__github__create_issue', 'allow')).toEqual({
        decision: 'ask',
        reason: 'This tool can change the GitHub repository',
      });
      expect(await fire('mcp__github__create_issue', 'deny')).toEqual({ decision: 'deny' });
      expect(await fire('mcp__slack__post', 'allow')).toEqual({ decision: 'allow' });
    });

    test('in plan mode a mod can tighten a call that is not read-only but cannot loosen it, and a read-only call is not bound', () => {
      const plan = { mode: 'plan' } as const;
      expect(mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, plan)).toEqual({
        decision: 'ask',
      });
      expect(
        mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, { ...plan, isReadOnly: true }),
      ).toEqual({ decision: 'allow' });
    });
  });

  spec('mods.reference.The e.isReadOnly field on tool.check', () => {
    test('e.isReadOnly is true when the tool reports the call as read-only, otherwise the field is absent', async () => {
      const h = eventHarness();
      const seen: boolean[] = [];
      h.mod('watcher', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push('isReadOnly' in e), next(e))),
      ]);
      await h.fire('tool.check', { ...check, isReadOnly: true });
      await h.fire('tool.check', check);
      expect(seen).toEqual([true, false]);
    });

    test('a matcher with isReadOnly true selects the read-only calls; isReadOnly false matches nothing, because the field is never false', async () => {
      const h = eventHarness();
      const seen: string[] = [];
      h.mod('read-only', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push('true'), next(e)), {
          matcher: { isReadOnly: true },
        }),
      ]);
      h.mod('never', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push('false'), next(e)), {
          matcher: { isReadOnly: false },
        }),
      ]);
      await h.fire('tool.check', { ...check, isReadOnly: true });
      await h.fire('tool.check', check);
      expect(seen).toEqual(['true']);
    });
  });
});

describe('agent and organization fields on tool.check', () => {
  spec('mods.reference.Agent and organization fields on tool.check', () => {
    test('e.agentId tells a subagent or teammate call from the main conversation, where it is absent', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('watcher', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push(e.agentId ?? 'main'), next(e))),
      ]);
      await h.fire('tool.check', check);
      await h.fire('tool.check', { ...check, agentId: 'agent-7' });
      expect(seen).toEqual(['main', 'agent-7']);
      expect(eventInputProblem('tool.check', { ...check, agentId: 7 })).toContain(
        'tool.check input: agentId',
      );
    });

    test('a matcher on agentId selects a subagent call', async () => {
      const h = eventHarness();
      const seen: string[] = [];
      h.mod('watcher', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push(String(e.agentId)), next(e)), {
          matcher: { agentId: /^agent-/ },
        }),
      ]);
      await h.fire('tool.check', check);
      await h.fire('tool.check', { ...check, agentId: 'agent-7' });
      expect(seen).toEqual(['agent-7']);
    });

    test('e.ceiling is ask for a connector tool the organization set to ask, and no other value', () => {
      expect(eventInputProblem('tool.check', { ...check, ceiling: 'ask' })).toBeUndefined();
      expect(eventInputProblem('tool.check', { ...check, ceiling: 'deny' })).toContain(
        'tool.check input: ceiling',
      );
    });

    test('a hook that allows a call with ceiling ask still gets a prompt: the organization requires approval', () => {
      expect(
        mergeToolCheck(
          { decision: 'ask' },
          { decision: 'allow' },
          { mode: 'default', ceiling: 'ask' },
        ),
      ).toEqual({ decision: 'ask' });
      expect(
        mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, { mode: 'default' }),
      ).toEqual({
        decision: 'allow',
      });
    });
  });
});
