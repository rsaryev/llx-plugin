/**
 * A small coding agent on the AI SDK that runs Claude Code plugins through the kit:
 *
 * - plugins load with `loadPlugin` and run in a `createPluginHost` session;
 * - `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`,
 *   `SubagentStop` and `SessionEnd` hooks fire where Claude Code fires them;
 * - skills and commands are listed to the model, run by the `Skill` tool or a `/plugin:name` prompt;
 * - plugin agents run as subagents through the `Agent` tool; plugin MCP servers add their tools.
 */
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  createPluginHost,
  listingLine,
  loadPlugin,
  readPluginDirectory,
  type HostPlugin,
  type Plugin,
  type PluginSession,
} from '@rsaryev/llx-plugin';
import { pluginDirDependencyIssues } from '@rsaryev/llx-plugin/marketplace';
import { tool, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import { z } from 'zod';
import { PluginMcp } from './mcp.ts';
import { loadPermissions, shellPermission, turnPermissions } from './permissions.ts';
import {
  aiSdkModels,
  diskFiles,
  fetchHttp,
  localLocations,
  localRunner,
  processEnvironment,
} from './ports.ts';
import { builtinTools, type ToolContext } from './tools.ts';
import { agentTool } from './subagent.ts';
import { appendTranscript } from './transcript.ts';
import { runTurn } from './turn.ts';
import { Trace } from './trace.ts';

export interface AgentOptions {
  /** Plugin folders, each loaded as `<folder name>@local` unless its manifest names it. */
  readonly plugins: readonly string[];
  /** The project the agent works in. */
  readonly cwd: string;
  /** The Anthropic key; unused when `languageModel` is given. */
  readonly apiKey?: string;
  /** Default `claude-haiku-5-5`. */
  readonly model?: string;
  /** A model to run instead of Anthropic's, such as a scripted one for a smoke test. */
  readonly languageModel?: LanguageModel;
  /** Saved `userConfig` values by plugin id. */
  readonly userConfig?: Record<string, Record<string, string | number | boolean | string[]>>;
  readonly echo?: boolean;
  readonly maxSteps?: number;
  /** `--permission-mode`; `acceptEdits` when omitted, so file edits in the working folder run. */
  readonly permissionMode?: string;
}

const BASE_INSTRUCTIONS = `You are a coding agent working in a local project. Use the tools to act; keep answers short.
Tools follow Claude Code's names and input shapes. When a skill fits the task, call the Skill tool with its name first and follow what it returns.`;

export interface PluginAgent {
  readonly trace: Trace;
  readonly session: PluginSession;
  /** One user turn: returns the final text. */
  send(prompt: string): Promise<string>;
  close(): Promise<void>;
}

/** The folders one `--plugin-dir` value loads: itself, or each child plugin of a folder of plugins. */
async function pluginFolders(dir: string): Promise<string[]> {
  const root = resolve(dir);
  const { isFolder, plugins } = await readPluginDirectory(diskFiles(root));
  return isFolder ? plugins.map((child) => join(root, child)) : [root];
}

async function loadOne(root: string, trace: Trace): Promise<Plugin | undefined> {
  const fallbackName = root.split('/').at(-1) ?? 'plugin';
  const { plugin, issues } = await loadPlugin({ files: diskFiles(root), fallbackName });
  for (const issue of issues)
    trace.add({
      kind: 'issue',
      message: `${fallbackName}: ${issue.severity} ${issue.path}: ${issue.message}`,
    });
  return plugin;
}

async function loadAll(dirs: readonly string[], trace: Trace) {
  const loaded: { root: string; plugin: Plugin }[] = [];
  for (const root of (await Promise.all(dirs.map(pluginFolders))).flat()) {
    const plugin = await loadOne(root, trace);
    if (plugin) loaded.push({ root, plugin });
  }
  // A plugin whose dependency is not loaded beside it stops loading, as with `claude --plugin-dir`.
  const unloaded = pluginDirDependencyIssues(
    loaded.map(({ plugin }) => ({
      name: plugin.name,
      dependencies: plugin.manifest?.dependencies,
    })),
  );
  for (const { name, issue } of unloaded)
    trace.add({ kind: 'issue', message: `${name}: not loaded: ${issue.message}` });
  const skip = new Set(unloaded.map((one) => one.name));
  const plugins: HostPlugin[] = [];
  const roots = new Map<string, string>();
  for (const { root, plugin } of loaded.filter((one) => !skip.has(one.plugin.name))) {
    const id = `${plugin.name}@local`;
    plugins.push({ id, plugin });
    roots.set(id, root);
  }
  return { plugins, roots };
}

export async function createPluginAgent(options: AgentOptions): Promise<PluginAgent> {
  const trace = new Trace(options.echo ?? false);
  const model: LanguageModel =
    options.languageModel ??
    createAnthropic({ apiKey: options.apiKey })(options.model ?? 'claude-haiku-5-5');
  const { plugins, roots } = await loadAll(options.plugins, trace);
  const permissions = await loadPermissions(options.cwd, options.permissionMode ?? 'acceptEdits');
  for (const issue of permissions.issues)
    trace.add({ kind: 'issue', message: `${issue.path}: ${issue.message}` });
  const dataDir = join(tmpdir(), 'kit-agent-data');
  await mkdir(dataDir, { recursive: true });
  const mcp = new PluginMcp();
  const sessionId = randomUUID();
  const transcriptPath = join(dataDir, `${sessionId}.jsonl`);
  const host = createPluginHost({
    plugins,
    ports: {
      commands: localRunner,
      locations: localLocations(options.cwd, roots, dataDir),
      // Claude Code gives the commands it runs the session id; ralph-loop's setup script reads it.
      environment: processEnvironment({ CLAUDE_CODE_SESSION_ID: sessionId }),
      http: fetchHttp,
      models: aiSdkModels(model),
      mcp,
    },
    settings: permissions.view,
    ...(options.userConfig ? { userConfig: options.userConfig } : {}),
  });
  for (const issue of host.issues)
    trace.add({ kind: 'issue', message: `${issue.path}: ${issue.message}` });
  const session = host.openSession({
    sessionId,
    cwd: options.cwd,
    permissionMode: permissions.mode,
    transcriptPath,
    effort: { level: 'medium' },
    interactive: false,
    shellPermission: shellPermission(permissions.context),
  });
  const abort = new AbortController();
  const signal = abort.signal;
  await mcp.start(session, (message) => trace.add({ kind: 'issue', message }));

  const start = await session.dispatch(
    'SessionStart',
    { source: 'startup', model: options.model ?? 'claude-haiku-5-5' },
    { signal },
  );
  for (const context of start.additionalContext)
    trace.add({ kind: 'hook', event: 'SessionStart', detail: context });
  const styles = session.outputStyles().filter((style) => style.forceForPlugin);

  const context: ToolContext = {
    session,
    cwd: options.cwd,
    trace,
    signal,
    permissions: turnPermissions(permissions.context),
  };
  const listing = session.skills().model;
  const instructions = [
    BASE_INSTRUCTIONS,
    `Working directory: ${options.cwd}`,
    ...styles.map((style) => style.instructions),
    ...start.additionalContext,
    listing.entries.length > 0
      ? `Skills you can run with the Skill tool:\n${listing.entries.map(listingLine).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const tools: ToolSet = {
    ...builtinTools(context),
    ...(await mcp.tools(context)),
    Skill: tool({
      description:
        'Run a skill by its name (as listed), with optional arguments. Returns its instructions.',
      inputSchema: z.object({ skill: z.string(), args: z.string().optional() }),
      execute: async ({ skill, args }) => {
        const expansion = await session.expandSkill(skill, {
          arguments: args ?? '',
          signal,
          invoker: 'model',
        });
        trace.add({ kind: 'skill', name: skill, by: 'model', ok: expansion.ok });
        if (expansion.ok) context.permissions.grant(expansion.grants);
        return expansion.ok
          ? expansion.text
          : `Skill refused: ${expansion.issues.map((i) => i.message).join('; ')}`;
      },
    }),
    Agent: await agentTool(session, model, context),
  };

  const messages: ModelMessage[] = [];
  return {
    trace,
    session,
    async send(prompt) {
      context.permissions.newTurn();
      const submit = await session.dispatch('UserPromptSubmit', { prompt }, { signal });
      if (!submit.proceed) {
        const reason = submit.block?.reason ?? 'blocked';
        trace.add({ kind: 'blocked', name: 'UserPromptSubmit', reason });
        return `Prompt blocked by a plugin hook: ${reason}`;
      }
      let content = await expandSlash(prompt, context);
      if (submit.additionalContext.length > 0) {
        for (const extra of submit.additionalContext)
          trace.add({ kind: 'hook', event: 'UserPromptSubmit', detail: extra });
        content += `\n\n<system-reminder>\n${submit.additionalContext.join('\n')}\n</system-reminder>`;
      }
      messages.push({ role: 'user', content });
      await appendTranscript(transcriptPath, messages.slice(-1));
      return runTurn({
        transcriptPath,
        model,
        instructions,
        tools,
        messages,
        session,
        trace,
        signal,
        maxSteps: options.maxSteps ?? 30,
      });
    },
    async close() {
      await session.dispatch('SessionEnd', { reason: 'other' }, { signal });
      await mcp.close();
      abort.abort();
    },
  };
}

/** `/plugin:skill args` typed by the user expands the skill in place of the prompt. */
async function expandSlash(prompt: string, { session, trace, signal, permissions }: ToolContext) {
  const match = /^\/(\S+)\s*([\s\S]*)$/.exec(prompt.trim());
  if (!match?.[1]) return prompt;
  const expansion = await session.expandSkill(match[1], {
    arguments: match[2] ?? '',
    signal,
    invoker: 'user',
  });
  trace.add({ kind: 'skill', name: match[1], by: 'user', ok: expansion.ok });
  if (!expansion.ok) {
    for (const issue of expansion.issues) trace.add({ kind: 'issue', message: issue.message });
    return prompt;
  }
  permissions.grant(expansion.grants);
  return expansion.text;
}
