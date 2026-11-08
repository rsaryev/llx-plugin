import type { HookHandler } from '../../protocol/hook-config.ts';
import type { HookEvent } from '../../protocol/official.ts';

/**
 * The words the docs quote for a hook's errors (hooks.md, "Exit code 2", "Other exit codes",
 * "Block the action when a hook fails"), kept in one file so each is checked against its source.
 */

/** `PreToolUse:Bash`: the event, and the tool when the event's input has one. */
export const hookName = (event: HookEvent, toolName: string | undefined): string =>
  toolName === undefined ? event : `${event}:${toolName}`;

/**
 * The part of a handler the docs put in brackets: a command hook's command and arguments ("[node
 * ${CLAUDE_PROJECT_DIR}/.claude/hooks/check-command.js]"). Judgment (spec/judgments.md): the other
 * types show their URL, `server:tool`, or their type.
 */
export function handlerLabel(handler: HookHandler): string {
  if ('command' in handler) return [handler.command, ...(handler.args ?? [])].join(' ');
  if ('url' in handler) return handler.url;
  if ('server' in handler) return `${handler.server}:${handler.tool}`;
  return handler.type;
}

/** "PreToolUse:Bash hook error: [${CLAUDE_PROJECT_DIR}/.claude/hooks/no-rm.sh]: Blocked: rm commands are not allowed". */
export const hookError = (name: string, label: string, text: string): string =>
  `${name} hook error: [${label}]: ${text}`;

/** "Failed with non-blocking status code: something broke". */
export const NON_BLOCKING_STATUS = 'Failed with non-blocking status code:';

/** Judgment (spec/judgments.md): the docs never show the notice of a hook that wrote nothing to stderr. */
export const NO_STDERR = 'no stderr output';

/** "the error includes `failed; blocking because onFailure is "block"` followed by node's own error output". */
export const failedBlocking = (detail: string): string =>
  withDetail('failed; blocking because onFailure is "block"', detail);

/** "After a timeout, the message says `timed out` instead of `failed`." */
export const timedOutBlocking = (detail: string): string =>
  withDetail('timed out; blocking because onFailure is "block"', detail);

/**
 * "If the error for a blocked tool call includes this text, a `PreToolUse` or `PermissionRequest`
 * command hook failed or timed out and blocked the call".
 */
export const windowsBlocking = (detail: string): string =>
  withDetail(
    "blocking because Git Bash wasn't found, so only exit code 0 or 2 counts as this hook's verdict.",
    detail,
  );

/**
 * `PreModelSwitch`: "A PreModelSwitch hook that doesn't respond before its timeout blocks the
 * switch." Judgment (spec/judgments.md): the docs give this block no message of its own.
 */
export const TIMED_OUT = 'timed out';
export const timedOutBlocksSwitch = (detail: string): string => withDetail(TIMED_OUT, detail);

/**
 * "The transcript shows a notice naming the hook, the timeout that fired, and that the output was
 * discarded" (`UserPromptSubmit`). Judgment (spec/judgments.md): the docs give the notice no
 * wording; the hook is named by the line around it, the timeout is written in seconds.
 */
export const timedOutDiscarded = (timeoutMs: number | undefined): string =>
  `${TIMED_OUT}${timeoutMs === undefined ? '' : ` after ${timeoutMs / 1000}s`}; the hook's output was discarded`;

const withDetail = (head: string, detail: string): string =>
  detail.trim() === '' ? head : `${head}\n${detail.trim()}`;

export const firstLine = (text: string): string => text.trim().split(/\r?\n/, 1)[0] ?? '';

/**
 * "When a plugin's hook blocks this way and its stderr is the blocking message, the error ends with
 * `This hook comes from the <plugin> plugin.` so that you know which plugin to disable or fix"
 * (plugins/troubleshooting.md). Judgment (spec/judgments.md): the docs give no separator, a space.
 */
export const fromPlugin = (message: string, plugin: string | undefined): string =>
  plugin === undefined ? message : `${message} This hook comes from the ${plugin} plugin.`;
