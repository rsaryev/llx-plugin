/**
 * `bun scenarios/run.ts [name…]`: runs the agent on Claude Haiku 5.5 against real plugins from the
 * official marketplace (fetched by `bun run corpus:fetch` at the repository root) and the kit-demo
 * fixture, each in a fresh temporary workspace, and checks what happened: hooks fired, calls
 * blocked, skills expanded, files and commits made, subagents and MCP tools used.
 */
import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPluginAgent } from '../src/agent.ts';
import { anthropicKey } from '../src/key.ts';
import type { Trace } from '../src/trace.ts';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const OFFICIAL = join(ROOT, '.cache', 'corpus', 'claude-plugins-official', 'plugins');
const DEMO = resolve(import.meta.dir, '..', 'fixtures', 'kit-demo');

interface Run {
  readonly ws: string;
  readonly trace: Trace;
  readonly answers: readonly string[];
  readonly http: readonly unknown[];
}

interface Scenario {
  readonly name: string;
  readonly plugins: readonly string[];
  readonly prompts: readonly string[];
  readonly setup?: (ws: string) => Promise<void>;
  readonly userConfig?: Record<string, Record<string, string>>;
  readonly checks: (run: Run) => Promise<readonly [string, boolean][]>;
}

const sh = async (cwd: string, command: string) => {
  const child = Bun.spawn(['bash', '-c', command], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(child.stdout).text();
  await child.exited;
  return out;
};
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const last = (run: Run) => run.answers.at(-1) ?? '';
const blockedWith = (run: Run, text: string) =>
  run.trace.of('blocked').some((b) => b.reason.includes(text));
const toolOutput = (run: Run, name: string) =>
  run.trace
    .of('tool')
    .filter((t) => t.name === name)
    .map((t) => t.output);

const SCENARIOS: Scenario[] = [
  {
    name: 'explanatory-output-style: SessionStart command hook shapes the answer',
    plugins: [join(OFFICIAL, 'explanatory-output-style')],
    // The style asks for insights "before and after writing code", so the task writes code.
    prompts: [
      'Write fib.py with an iterative fibonacci(n) function and run it for n=10 with python3.',
    ],
    checks: async (run) => [
      [
        'SessionStart hook added context',
        run.trace
          .of('hook')
          .some((h) => h.event === 'SessionStart' && h.detail.includes('explanatory')),
      ],
      ['answer carries the ★ Insight block the style asks for', last(run).includes('★ Insight')],
    ],
  },
  {
    name: 'commit-commands: /commit-commands:commit runs its !`git …` context and commits',
    plugins: [join(OFFICIAL, 'commit-commands')],
    setup: async (ws) => {
      await sh(
        ws,
        'git init -q && git config user.email t@example.com && git config user.name Test && echo one > a.txt && git add . && git commit -qm init',
      );
      await writeFile(join(ws, 'a.txt'), 'one\ntwo\n');
      await writeFile(join(ws, 'b.txt'), 'new file\n');
    },
    prompts: ['/commit-commands:commit'],
    checks: async (run) => [
      ['command expanded by the user', run.trace.of('skill').some((s) => s.by === 'user' && s.ok)],
      ['a second commit exists', (await sh(run.ws, 'git rev-list --count HEAD')).trim() === '2'],
      [
        'the change to a.txt is committed',
        (await sh(run.ws, 'git diff HEAD -- a.txt')).trim() === '',
      ],
    ],
  },
  {
    name: 'hookify: a .local.md rule blocks `rm -rf` through its Python PreToolUse hook',
    plugins: [join(OFFICIAL, 'hookify')],
    setup: async (ws) => {
      await mkdir(join(ws, '.claude'), { recursive: true });
      await cp(
        join(OFFICIAL, 'hookify', 'examples', 'dangerous-rm.local.md'),
        join(ws, '.claude', 'hookify.dangerous-rm.local.md'),
      );
      await mkdir(join(ws, 'build'));
      await writeFile(join(ws, 'build', 'out.txt'), 'x');
    },
    prompts: ['Run exactly this bash command once and report the result: rm -rf build'],
    checks: async (run) => [
      [
        'the Bash call was blocked by the hook',
        run.trace.of('blocked').some((b) => b.name === 'Bash'),
      ],
      ['build/ still exists', await exists(join(run.ws, 'build', 'out.txt'))],
    ],
  },
  {
    name: 'ralph-loop: a ```! setup block, then its Stop hook feeds the prompt back until max iterations',
    plugins: [join(OFFICIAL, 'ralph-loop')],
    prompts: [
      // The arguments reach the setup script's shell line as typed (skills.md, "$ARGUMENTS always expands
      // to the full argument string as typed"): no backticks, quotes or redirections in the prompt.
      '/ralph-loop:ralph-loop Use the Bash tool to append one line with the word tick to the file ticks.txt then reply in one short sentence --max-iterations 3',
    ],
    checks: async (run) => {
      const ticks = (await readFile(join(run.ws, 'ticks.txt'), 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean);
      return [
        [
          'setup script ran from the ```! block (state file created, then removed at the end)',
          !(await exists(join(run.ws, '.claude', 'ralph-loop.local.md'))),
        ],
        [
          'Stop hook sent Claude back at least twice',
          run.trace.of('hook').filter((h) => h.event === 'Stop' && h.detail.startsWith('continue'))
            .length >= 2,
        ],
        [`the task ran once per iteration (${ticks.length} ticks)`, ticks.length === 3],
      ];
    },
  },
  {
    name: 'frontend-design: the model picks the plugin skill on its own',
    plugins: [join(OFFICIAL, 'frontend-design')],
    prompts: [
      'Build a single-file landing page index.html for a small coffee shop. Keep it under 120 lines.',
    ],
    checks: async (run) => [
      [
        'Skill frontend-design:frontend-design invoked by the model',
        run.trace
          .of('skill')
          .some((s) => s.by === 'model' && s.ok && s.name.includes('frontend-design')),
      ],
      ['index.html written', await exists(join(run.ws, 'index.html'))],
    ],
  },
  {
    name: 'kit-demo: skill with $ARGUMENTS and a !`cmd` placeholder; Stop prompt hook on Haiku',
    plugins: [DEMO],
    prompts: ['/kit-demo:greet Alice'],
    checks: async (run) => [
      ['skill expanded', run.trace.of('skill').some((s) => s.ok && s.name === 'kit-demo:greet')],
      ['answer greets Alice', last(run).includes('Alice')],
      ['the injected command ran (build-42)', last(run).includes('42')],
      ['Stop prompt hook made the answer end with DONE', /DONE\W*$/.test(last(run).trim())],
    ],
  },
  {
    name: 'kit-demo: PreToolUse command hook with `if: "Bash(curl *)"` denies the call',
    plugins: [DEMO],
    prompts: ['Run this bash command: curl -s https://example.com'],
    checks: async (run) => [
      ['curl denied with the hook reason', blockedWith(run, 'kit-demo forbids network access')],
      [
        'no Bash call ran curl',
        !run.trace
          .of('tool')
          .some((t) => t.name === 'Bash' && JSON.stringify(t.input).includes('curl')),
      ],
    ],
  },
  {
    name: 'kit-demo: PostToolUse command and http hooks on Write',
    plugins: [DEMO],
    prompts: ['Write a file notes.txt containing the word hi.'],
    checks: async (run) => [
      [
        'notes.txt written',
        (await readFile(join(run.ws, 'notes.txt'), 'utf8').catch(() => '')).includes('hi'),
      ],
      [
        'command hook added its context',
        run.trace.of('hook').some((h) => h.detail.includes('kit-demo noted a change to')),
      ],
      [
        'http hook received the PostToolUse input',
        run.http.some((body) => JSON.stringify(body).includes('"tool_name":"Write"')),
      ],
    ],
  },
  {
    name: 'kit-demo: plugin agent as a subagent',
    plugins: [DEMO],
    setup: (ws) => writeFile(join(ws, 'data.txt'), 'a\nb\nc\nd\ne\nf\ng\n'),
    prompts: [
      'Use the kit-demo:line-counter subagent to count the lines in data.txt, then tell me the number.',
    ],
    checks: async (run) => [
      ['subagent ran', run.trace.of('agent').some((a) => a.name === 'kit-demo:line-counter')],
      ['answer says 7', last(run).includes('7')],
    ],
  },
  {
    name: 'kit-demo: MCP server from .mcp.json with ${user_config.greeting}',
    plugins: [DEMO],
    userConfig: { 'kit-demo@local': { greeting: 'Salaam' } },
    prompts: ['Use the calc MCP tools: add 2 and 40, and fetch the greeting word. Report both.'],
    checks: async (run) => [
      [
        'add tool returned 42',
        toolOutput(run, 'mcp__plugin_kit-demo_calc__add').some((o) => o.includes('42')),
      ],
      [
        'greeting came from user config',
        toolOutput(run, 'mcp__plugin_kit-demo_calc__greeting').some((o) => o.includes('Salaam')),
      ],
    ],
  },
];

const http: unknown[] = [];
const server = Bun.serve({
  port: 48731,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    http.push(await request.json().catch(() => null));
    return Response.json({});
  },
});

const only = process.argv.slice(2);
const apiKey = await anthropicKey();
let failed = 0;
for (const scenario of SCENARIOS.filter(
  (s) => only.length === 0 || only.some((o) => s.name.includes(o)),
)) {
  console.log(`\n▶ ${scenario.name}`);
  const ws = await mkdtemp(join(tmpdir(), 'kit-agent-'));
  await scenario.setup?.(ws);
  http.length = 0;
  const agent = await createPluginAgent({
    plugins: scenario.plugins,
    cwd: ws,
    apiKey,
    echo: true,
    ...(scenario.userConfig ? { userConfig: scenario.userConfig } : {}),
  });
  const answers: string[] = [];
  try {
    for (const prompt of scenario.prompts) answers.push(await agent.send(prompt));
  } catch (cause) {
    console.log(`  ✗ the run threw: ${String(cause)}`);
  }
  await agent.close();
  for (const [check, ok] of await scenario.checks({
    ws,
    trace: agent.trace,
    answers,
    http: [...http],
  })) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${check}`);
  }
}
await server.stop();
console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
