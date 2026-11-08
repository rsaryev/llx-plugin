/**
 * The notice of a hook that reaches its timeout on `UserPromptSubmit`: hooks.md § "UserPromptSubmit"
 * ("a `UserPromptSubmit` command, HTTP, or MCP tool hook that reaches its timeout is canceled and
 * its output ... is discarded. The prompt still reaches Claude without that context. ... The
 * transcript shows a notice naming the hook, the timeout that fired, and that the output was
 * discarded."), with § "Block the action when a hook fails" for `onFailure`. The notice wording is
 * the kit's (spec/judgments.md); what it must carry is the docs'.
 */
import { describe, expect, test } from 'bun:test';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import { verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const TIMED_OUT = { kind: 'timed-out' } as const;
const SECONDS = 5;

const command: HookHandler = { type: 'command', command: './hook.sh', timeout: SECONDS };
const web: HookHandler = { type: 'http', url: 'http://h/x', timeout: SECONDS };
const tool: HookHandler = { type: 'mcp_tool', server: 'guard', tool: 'check', timeout: SECONDS };

const noticeOf = (
  hook: HookHandler,
  event: 'UserPromptSubmit' | 'PreToolUse' = 'UserPromptSubmit',
) => verdictOf(event, TIMED_OUT, { hook, timeoutMs: SECONDS * 1000 });

const discards = (label: string) =>
  `UserPromptSubmit hook error: [${label}]: timed out after 5s; the hook's output was discarded`;

describe('a UserPromptSubmit hook that reaches its timeout, onFailure unset', () => {
  spec('hooks.handler.command.onFailure', () => {
    test('the prompt goes ahead and the notice names the hook, the timeout and the discarded output', () => {
      const verdict = noticeOf(command);
      expect(verdict.block).toBeUndefined();
      expect(verdict.status).toBe('timed-out');
      expect(verdict.notice?.message).toBe(discards('./hook.sh'));
    });

    test('onFailure block blocks the prompt with the documented words instead', () => {
      const verdict = noticeOf({ ...command, onFailure: 'block' });
      expect(verdict.block?.via).toBe('timeout');
      expect(verdict.block?.message).toBe(
        'UserPromptSubmit hook error: [./hook.sh]: timed out; blocking because onFailure is "block"',
      );
    });

    test('another event keeps the plain "timed out" notice', () => {
      expect(noticeOf(command, 'PreToolUse').notice?.message).toBe(
        'PreToolUse:Bash hook error: [./hook.sh]: timed out',
      );
    });
  });

  spec('hooks.handler.http.onFailure', () => {
    test('an HTTP hook gets the same notice, named by its URL', () => {
      expect(noticeOf(web).notice?.message).toBe(discards('http://h/x'));
    });

    test('an MCP tool hook gets it too, named by server and tool', () => {
      expect(noticeOf(tool).notice?.message).toBe(discards('guard:check'));
    });

    test('a hook with no known limit still says the output was discarded', () => {
      const verdict = verdictOf('UserPromptSubmit', TIMED_OUT, { hook: web });
      expect(verdict.notice?.message).toBe(
        "UserPromptSubmit hook error: [http://h/x]: timed out; the hook's output was discarded",
      );
    });
  });
});
