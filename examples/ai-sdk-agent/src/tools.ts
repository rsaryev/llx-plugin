/**
 * Claude Code's built-in tools under their own names and input shapes (tools-reference.md), so a
 * plugin's `"matcher": "Write|Edit"` and `"if": "Bash(git *)"` mean what they mean there. Every
 * call goes through the plugins' `PreToolUse` and `PostToolUse` hooks first and after.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { PluginSession } from '@rsaryev/claude-plugin-kit';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Trace } from './trace.ts';

export interface ToolContext {
  readonly session: PluginSession;
  readonly cwd: string;
  readonly trace: Trace;
  readonly signal: AbortSignal;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

/** Runs `execute` between the plugins' `PreToolUse` and `PostToolUse` hooks, as Claude Code does. */
/** One tool call as the hooks see it: Claude Code's tool name, its input and the call id. */
export interface ToolCall {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly toolUseId: string;
}

export async function guarded(
  context: ToolContext,
  { name, input, toolUseId }: ToolCall,
  execute: (input: Record<string, unknown>) => Promise<unknown>,
): Promise<string> {
  const { session, trace, signal } = context;
  const pre = await session.dispatch(
    'PreToolUse',
    { tool_name: name, tool_input: input, tool_use_id: toolUseId },
    { signal },
  );
  for (const message of pre.systemMessages)
    trace.add({ kind: 'hook', event: 'PreToolUse', detail: message });
  if (
    !pre.proceed ||
    pre.effects.permissionDecision === 'deny' ||
    pre.effects.permissionDecision === 'ask'
  ) {
    const reason =
      pre.block?.reason || pre.effects.permissionDecisionReason || 'denied by a PreToolUse hook';
    trace.add({ kind: 'blocked', name, reason });
    return `The ${name} call was blocked by a plugin hook: ${reason}`;
  }
  const effective = pre.effects.updatedInput ?? input;
  if (pre.effects.updatedInput)
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
  const notes = [...pre.additionalContext, ...post.additionalContext];
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
