/**
 * The model-request oracle: what Claude Code SENDS THE MODEL, read as a black box. `claude -p` runs
 * with `ANTHROPIC_BASE_URL` pointing at a local fake Messages API that records each request body and
 * answers with a one-word streamed reply, so no model is called and nothing is spent. The config
 * folder and the working folder are private; the environment is bare apart from `PATH`.
 *
 * This RUNS the plugin (its hooks, its MCP servers, a skill's `!` commands): point it only at
 * fixtures written for this purpose, never at a third-party or corpus plugin.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CLAUDE_BIN } from './claude-bin.ts';

const TIMEOUT_MS = 120_000;

const contentSchema = z.union([
  z.string(),
  z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()),
]);
const requestSchema = z
  .object({
    system: z.union([z.string(), z.array(z.object({ text: z.string() }).loose())]).optional(),
    messages: z.array(z.object({ role: z.string(), content: contentSchema }).loose()),
  })
  .loose();
export type ModelRequest = z.infer<typeof requestSchema>;

export interface ModelRun {
  /** Every Messages API request, in order. */
  readonly requests: readonly ModelRequest[];
  /** The real paths of the run, to normalize the texts (`normalizeRun`). */
  readonly paths: { readonly pluginRoot: string; readonly config: string; readonly cwd: string };
}

export interface ModelRunInput {
  /** The plugin folder, passed with `--plugin-dir`. */
  readonly plugin: string;
  /** The prompt of `claude -p`, `/plugin:skill args` to invoke a skill. */
  readonly prompt: string;
  /** Written as the private config folder's `settings.json`. */
  readonly settings?: unknown;
}

const sse = (type: string, data: unknown): string =>
  `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

/** A complete streamed reply of one text block, `ok`. */
const REPLY =
  sse('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_oracle',
      type: 'message',
      role: 'assistant',
      model: 'oracle',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  }) +
  sse('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  }) +
  sse('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'ok' },
  }) +
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }) +
  sse('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  }) +
  sse('message_stop', { type: 'message_stop' });

export async function runModelOracle(input: ModelRunInput): Promise<ModelRun> {
  const work = await realpath(await mkdtemp(join(tmpdir(), 'kit-model-oracle-')));
  const requests: ModelRequest[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url);
      if (!url.pathname.endsWith('/messages')) return Response.json({});
      requests.push(requestSchema.parse(await request.json()));
      return new Response(REPLY, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  try {
    const config = join(work, 'config');
    const cwd = join(work, 'work');
    await mkdir(config, { recursive: true });
    await mkdir(cwd, { recursive: true });
    if (input.settings !== undefined) {
      await writeFile(join(config, 'settings.json'), JSON.stringify(input.settings));
    }
    const run = Bun.spawn(
      [CLAUDE_BIN, '-p', '--plugin-dir', input.plugin, '--max-turns', '1', input.prompt],
      {
        cwd,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: work,
          CLAUDE_CONFIG_DIR: config,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.port}`,
          ANTHROPIC_API_KEY: 'sk-ant-oracle',
        },
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
      },
    );
    const timer = setTimeout(() => run.kill(), TIMEOUT_MS);
    await run.exited;
    clearTimeout(timer);
    return { requests, paths: { pluginRoot: await realpath(input.plugin), config, cwd } };
  } finally {
    await server.stop(true);
    await rm(work, { recursive: true, force: true });
  }
}

/** The text blocks of a request's user messages, in order. */
export function userTexts(request: ModelRequest): string[] {
  return request.messages
    .filter((message) => message.role === 'user')
    .flatMap((message) =>
      typeof message.content === 'string'
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === 'text' && part.text !== undefined ? [part.text] : [],
          ),
    );
}

const SESSION_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * A text with the run's own paths and session id as placeholders, so runs compare: `<PLUGIN_ROOT>`,
 * `<PLUGIN_DATA>` (Claude Code's `<config>/plugins/data/<id>`), `<CWD>`, `<SESSION_ID>`.
 */
export function normalize(
  text: string,
  paths: { readonly pluginRoot: string; readonly pluginData: string; readonly cwd: string },
): string {
  return text
    .split(paths.pluginData)
    .join('<PLUGIN_DATA>')
    .split(paths.pluginRoot)
    .join('<PLUGIN_ROOT>')
    .split(paths.cwd)
    .join('<CWD>')
    .replace(SESSION_ID, '<SESSION_ID>');
}

/** Claude Code's data folder of an `--plugin-dir` plugin: `<config>/plugins/data/<name>-inline`. */
export const inlineDataDir = (config: string, plugin: string): string =>
  join(config, 'plugins', 'data', `${plugin}-inline`);

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}
