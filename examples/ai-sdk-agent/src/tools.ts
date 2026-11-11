/**
 * Claude Code's built-in tools under their own names and input shapes (tools-reference.md), so a
 * plugin's `"matcher": "Write|Edit"` and `"if": "Bash(git *)"` mean what they mean there. Every
 * call goes through the plugins' `PreToolUse` hooks and the permission rules first, and the
 * `PostToolUse` hooks after.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Decision, PluginSession } from '@rsaryev/llx-plugin';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { TurnPermissions } from './permissions.ts';
import type { Trace } from './trace.ts';

export interface ToolContext {
  readonly session: PluginSession;
  readonly cwd: string;
  readonly trace: Trace;
  readonly signal: AbortSignal;
  /** The permission rules of the turn: the settings', and the grants of the skills it invoked. */
  readonly permissions: TurnPermissions;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One tool call as the hooks see it: Claude Code's tool name, its input and the call id. */
export interface ToolCall {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly toolUseId: string;
}

/** Why a call does not run, in the words of the hook, else of the decision. */
const REFUSAL: { readonly [O in Exclude<Decision['outcome'], 'allow'>]: string } = {
  deny: 'denied',
  ask: 'needs approval, and no one can answer in this non-interactive agent',
  classify: 'needs the auto-mode review, which this agent does not run',
};

/**
 * Runs `execute` as Claude Code runs a tool: `session.checkTool` runs the plugins' `PreToolUse`
 * hooks and decides over the input they return; only an `allow` runs, then `PostToolUse`.
 */
export async function guarded(
  context: ToolContext,
  { name, input, toolUseId }: ToolCall,
  execute: (input: Record<string, unknown>) => Promise<unknown>,
): Promise<string> {
  const { session, trace, signal, permissions } = context;
  const check = await session.checkTool(
    { toolName: name, input },
    { toolUseId, permissionContext: permissions.current(), signal },
  );
  const { hook, decision } = check;
  for (const message of hook.systemMessages)
    trace.add({ kind: 'hook', event: 'PreToolUse', detail: message });
  if (decision.outcome !== 'allow') {
    const why = hook.block?.reason || hook.effects.permissionDecisionReason;
    const reason = why
      ? `${why} (${decision.reason})`
      : `${REFUSAL[decision.outcome]} (${decision.reason})`;
    trace.add({ kind: 'blocked', name, reason });
    return `The ${name} call did not run: ${reason}`;
  }
  const effective = isRecord(check.input) ? check.input : input;
  if (hook.effects.updatedInput)
    trace.add({
      kind: 'hook',
      event: 'PreToolUse',
      detail: `updatedInput ${JSON.stringify(effective)}`,
    });
  let response: unknown;
  try {
    response = await execute(effective);
  } catch (cause) {
    response = `Error: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  const post = await session.dispatch(
    'PostToolUse',
    { tool_name: name, tool_input: effective, tool_response: response, tool_use_id: toolUseId },
    { signal },
  );
  const output = text(post.effects.updatedToolOutput ?? response);
  trace.add({ kind: 'tool', name, input: effective, output });
  const notes = [...hook.additionalContext, ...post.additionalContext];
  if (post.block) notes.push(post.block.reason);
  for (const note of notes) trace.add({ kind: 'hook', event: 'PostToolUse', detail: note });
  return notes.length === 0
    ? output
    : `${output}\n\n<system-reminder>\n${notes.join('\n')}\n</system-reminder>`;
}

const at = (cwd: string, path: string) => (isAbsolute(path) ? path : resolve(cwd, path));

async function bash(command: string, cwd: string, timeout: number, signal: AbortSignal) {
  const child = Bun.spawn(['bash', '-c', command], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout,
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout: stdout.slice(-20_000), stderr: stderr.slice(-5_000), exitCode: code };
}

/** Bash, Read, Write and Edit with Claude Code's input fields. */
export function builtinTools(context: ToolContext): ToolSet {
  const { cwd, signal } = context;
  return {
    Bash: tool({
      description:
        'Run a bash command in the working directory and return stdout, stderr and the exit code.',
      inputSchema: z.object({
        command: z.string(),
        description: z.string().optional(),
        timeout: z.number().optional().describe('milliseconds, at most 600000'),
      }),
      execute: (input, { toolCallId }) =>
        guarded(context, { name: 'Bash', input, toolUseId: toolCallId }, (i) =>
          bash(String(i.command), cwd, Math.min(Number(i.timeout ?? 120_000), 600_000), signal),
        ),
    }),
    Read: tool({
      description: 'Read a text file.',
      inputSchema: z.object({
        file_path: z.string(),
        offset: z.number().optional(),
        limit: z.number().optional(),
      }),
      execute: (input, { toolCallId }) =>
        guarded(context, { name: 'Read', input, toolUseId: toolCallId }, async (i) => {
          const lines = (await readFile(at(cwd, String(i.file_path)), 'utf8')).split('\n');
          const start = Number(i.offset ?? 1) - 1;
          return lines.slice(start, start + Number(i.limit ?? 2000)).join('\n');
        }),
    }),
    Write: tool({
      description: 'Create or overwrite a file.',
      inputSchema: z.object({ file_path: z.string(), content: z.string() }),
      execute: (input, { toolCallId }) =>
        guarded(context, { name: 'Write', input, toolUseId: toolCallId }, async (i) => {
          const path = at(cwd, String(i.file_path));
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, String(i.content));
          return `Wrote ${path}`;
        }),
    }),
    Edit: tool({
      description:
        'Replace old_string with new_string in a file (exactly once unless replace_all).',
      inputSchema: z.object({
        file_path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
      }),
      execute: (input, { toolCallId }) =>
        guarded(context, { name: 'Edit', input, toolUseId: toolCallId }, async (i) => {
          const path = at(cwd, String(i.file_path));
          const before = await readFile(path, 'utf8');
          const old = String(i.old_string);
          const count = before.split(old).length - 1;
          if (count === 0) throw new Error('old_string not found');
          if (count > 1 && i.replace_all !== true)
            throw new Error(`old_string found ${count} times`);
          await writeFile(
            path,
            i.replace_all === true
              ? before.replaceAll(old, String(i.new_string))
              : before.replace(old, String(i.new_string)),
          );
          return `Edited ${path}`;
        }),
    }),
  };
}
