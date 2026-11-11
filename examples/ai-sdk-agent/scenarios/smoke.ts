/**
 * `bun scenarios/smoke.ts`: one turn of the agent on a scripted model, so no key and no network. It
 * runs the kit-demo fixture end to end through the AI SDK: the `/kit-demo:greet` skill with its
 * `!` placeholder, the `PreToolUse` deny of `curl`, the `PostToolUse` command and http hooks on
 * `Write`, the `calc` MCP server with `${user_config.greeting}`, and the `Stop` prompt hook, which
 * sends the turn back once until the answer ends with DONE. The repository's `bun run check` runs it.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { createPluginAgent } from '../src/agent.ts';

const DEMO = resolve(import.meta.dir, '..', 'fixtures', 'kit-demo');
const ADD = 'mcp__plugin_kit-demo_calc__add';
const GREETING = 'mcp__plugin_kit-demo_calc__greeting';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const text = (value: string): LanguageModelV4GenerateResult => ({
  content: [{ type: 'text', text: value }],
  finishReason: { unified: 'stop', raw: 'end_turn' },
  usage,
  warnings: [],
});
const call = (id: number, toolName: string, input: unknown): LanguageModelV4GenerateResult => ({
  content: [
    { type: 'tool-call', toolCallId: `call-${id}`, toolName, input: JSON.stringify(input) },
  ],
  finishReason: { unified: 'tool-calls', raw: 'tool_use' },
  usage,
  warnings: [],
});

const ws = await mkdtemp(join(tmpdir(), 'kit-agent-smoke-'));
// An MCP tool asks before it runs and `-p` has no one to ask: the project allows the server's tools.
await mkdir(join(ws, '.claude'));
await writeFile(
  join(ws, '.claude', 'settings.json'),
  JSON.stringify({ permissions: { allow: ['mcp__plugin_kit-demo_calc'] } }),
);
const prompts: string[] = [];

/** The script: by how many tool results the prompt holds, the next step of the turn. */
function reply(options: LanguageModelV4CallOptions): LanguageModelV4GenerateResult {
  const seen = JSON.stringify(options.prompt);
  prompts.push(seen);
  // The Stop prompt hook asks with no instructions: it passes an answer that ends with DONE.
  if (seen.includes("You check an assistant's final message")) {
    return text(
      /DONE\\"/.test(seen)
        ? '{"ok": true}'
        : '{"ok": false, "reason": "End your final message with the word DONE."}',
    );
  }
  const results = options.prompt
    .filter((message) => message.role === 'tool')
    .flatMap((message) => message.content).length;
  const steps = [
    () => call(1, 'Bash', { command: 'curl -s https://example.com' }),
    () => call(2, 'Write', { file_path: join(ws, 'notes.txt'), content: 'hi' }),
    () => call(3, ADD, { a: 2, b: 3 }),
    () => call(4, GREETING, {}),
  ];
  const step = steps[results];
  if (step !== undefined) return step();
  return text(seen.includes('Stop hook feedback') ? 'Hello Alice, build 42. DONE' : 'Hello Alice.');
}

const http: unknown[] = [];
const server = Bun.serve({
  port: 48731,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    http.push(await request.json().catch(() => null));
    return Response.json({});
  },
});

const agent = await createPluginAgent({
  plugins: [DEMO],
  cwd: ws,
  languageModel: new MockLanguageModelV4({ doGenerate: async (options) => reply(options) }),
  userConfig: { 'kit-demo@local': { greeting: 'Ahoy' } },
});
let answer = '';
try {
  answer = await agent.send('/kit-demo:greet Alice');
} finally {
  await agent.close();
  await server.stop();
}

const { trace } = agent;
const output = (name: string) =>
  trace
    .of('tool')
    .filter((one) => one.name === name)
    .map((one) => one.output)
    .join('\n');
const checks: [string, boolean][] = [
  ['the skill expanded with its ! placeholder', prompts[0]?.includes('build-42') === true],
  ['the skill got $ARGUMENTS', prompts[0]?.includes('Greet Alice') === true],
  [
    'PreToolUse denied curl',
    trace.of('blocked').some((one) => one.reason.includes('kit-demo forbids')),
  ],
  ['Write wrote the file', (await readFile(join(ws, 'notes.txt'), 'utf8')) === 'hi'],
  [
    'the PostToolUse command hook added its context',
    trace.of('hook').some((one) => one.detail.includes('kit-demo noted a change to')),
  ],
  [
    'the PostToolUse http hook got the input',
    http.some((body) => JSON.stringify(body).includes('"tool_name":"Write"')),
  ],
  ['the MCP add tool answered 5', output(ADD).includes('5')],
  ['the MCP server got ${user_config.greeting}', output(GREETING).includes('Ahoy')],
  ['the Stop prompt hook sent the turn back once', answer.endsWith('DONE')],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}`);
}
if (failed > 0) {
  for (const event of trace.events) console.log(JSON.stringify(event));
}
process.exit(failed === 0 ? 0 : 1);
