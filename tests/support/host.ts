/**
 * Fixtures of the host tests: in-memory plugins of realistic shape (written for this suite, not
 * copied from a published plugin), loaded through the real loader, and a host over fakes.
 */
import { createPluginHost, type HostPlugin, type PluginHostOptions } from '../../src/host/index.ts';
import { loadPlugin } from '../../src/loading/index.ts';
import type { Plugin } from '../../src/loading/index.ts';
import type { PolicyView } from '../../src/settings/index.ts';
import {
  fakeEnvironment,
  locations,
  memoryFiles,
  recordingHttp,
  scriptedRunner,
  type HttpReply,
  type RunnerReply,
} from './ports.ts';

const json = (value: unknown): string => JSON.stringify(value);

/** The plugin the files make, through the loader; a test never runs on a plugin that does not load. */
export async function loaded(files: Record<string, string>): Promise<Plugin> {
  const { plugin, issues } = await loadPlugin({ files: memoryFiles(files) });
  if (plugin === undefined) throw new Error(`the plugin does not load: ${json(issues)}`);
  return plugin;
}

/** `formatter`: a skill with arguments, a gated pair of command hooks, an agent, a stdio server. */
const FORMATTER_FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': json({
    name: 'formatter',
    version: '1.2.0',
    userConfig: {
      endpoint: { type: 'string', title: 'Endpoint', description: 'Where the service listens' },
      api_token: {
        type: 'string',
        title: 'Token',
        description: 'Service token',
        sensitive: true,
      },
    },
  }),
  'skills/review/SKILL.md': [
    '---',
    'description: Review a path against the team rules',
    'argument-hint: <path>',
    '---',
    'Review $ARGUMENTS using the rules in ${CLAUDE_PLUGIN_ROOT}/rules.md.',
  ].join('\n'),
  'skills/release/SKILL.md':
    '---\ndescription: Cut a release\ndisable-model-invocation: true\n---\nRelease it.',
  'skills/internal/SKILL.md':
    '---\ndescription: Background knowledge\nuser-invocable: false\n---\nKnow things.',
  'skills/status/SKILL.md':
    '---\ndescription: Show the branch\n---\nBranch: !`git rev-parse --abbrev-ref HEAD`',
  'commands/db/migrate.md': '---\ndescription: Run migrations\n---\nMigrate the database.',
  'agents/reviewer.md': [
    '---',
    'name: reviewer',
    'description: Reviews diffs for the team',
    'tools: Read, Grep',
    'model: sonnet',
    '---',
    'You review diffs. Rules live in ${CLAUDE_PLUGIN_ROOT}/rules.md.',
  ].join('\n'),
  'output-styles/terse.md': '---\nname: terse\ndescription: Short answers\n---\nBe terse.',
  'hooks/hooks.json': json({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh' }],
        },
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: '${CLAUDE_PLUGIN_ROOT}/hooks/git-audit.sh',
              if: 'Bash(git *)',
            },
          ],
        },
      ],
    },
  }),
  '.mcp.json': json({
    mcpServers: {
      db: {
        command: '${CLAUDE_PLUGIN_ROOT}/bin/db-server',
        args: ['--endpoint', '${user_config.endpoint}'],
      },
    },
  }),
  '.lsp.json': json({
    ts: {
      command: '${CLAUDE_PLUGIN_ROOT}/bin/ts-ls',
      extensionToLanguage: { '.ts': 'typescript' },
    },
  }),
  'monitors/monitors.json': json([
    {
      name: 'deploy-log',
      command: 'tail -f ${CLAUDE_PLUGIN_ROOT}/deploy.log',
      description: 'Deploy log',
    },
  ]),
};

/** `audit`: an HTTP hook after every tool call. */
const AUDIT_FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': json({ name: 'audit', version: '0.3.0' }),
  'hooks/hooks.json': json({
    hooks: {
      PostToolUse: [{ hooks: [{ type: 'http', url: 'https://hooks.example/audit', timeout: 5 }] }],
    },
  }),
};

/** `dormant`: has everything a plugin can, and is switched off in the tests that need that. */
const DORMANT_FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': json({ name: 'dormant', version: '1.0.0' }),
  'skills/wake/SKILL.md': '---\ndescription: Wake up\n---\nWake.',
  'hooks/hooks.json': json({
    hooks: {
      PreToolUse: [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/never.sh' }] }],
    },
  }),
  '.mcp.json': json({ mcpServers: { never: { command: 'never' } } }),
};

export const FORMATTER = 'formatter@acme-tools';
const AUDIT = 'audit@acme-tools';
const DORMANT = 'dormant@acme-tools';

export interface HostFixture {
  readonly plugins?: readonly HostPlugin[];
  readonly settings?: PolicyView;
  readonly userConfig?: PluginHostOptions['userConfig'];
  readonly runs?: readonly RunnerReply[];
  readonly http?: readonly HttpReply[];
  readonly env?: Record<string, string>;
  readonly workflows?: PluginHostOptions['workflows'];
}

/** The three plugins above, formatter and audit on, dormant off. */
export async function standardPlugins(): Promise<readonly HostPlugin[]> {
  return [
    { id: FORMATTER, plugin: await loaded(FORMATTER_FILES) },
    { id: AUDIT, plugin: await loaded(AUDIT_FILES) },
    { id: DORMANT, plugin: await loaded(DORMANT_FILES), enabled: false },
  ];
}

/** A host over fakes; `runner` and `web` are the fakes it was given, for the assertions. */
export async function hostOf(fixture: HostFixture = {}) {
  const runner = scriptedRunner(...(fixture.runs ?? []));
  const web = recordingHttp(...(fixture.http ?? []));
  const host = createPluginHost({
    plugins: fixture.plugins ?? (await standardPlugins()),
    ports: {
      commands: runner,
      http: web,
      // Every directory in this in-memory host fixture exists, including plugins added by update.
      // Missing-directory and cwd-fallback behavior is tested with explicit Locations in hooks/.
      locations: {
        ...locations(),
        existingDirectory: (candidates) => Promise.resolve(candidates[0]),
      },
      environment: fakeEnvironment(fixture.env),
    },
    ...(fixture.settings === undefined ? {} : { settings: fixture.settings }),
    ...(fixture.userConfig === undefined ? {} : { userConfig: fixture.userConfig }),
    ...(fixture.workflows === undefined ? {} : { workflows: fixture.workflows }),
  });
  return { host, runner, web };
}

/** Options of a session in `/work/app`, in `default` mode. */
export const SESSION = {
  sessionId: 'sess-1',
  cwd: '/work/app',
  permissionMode: 'default',
  transcriptPath: '/work/.claude/sess-1.jsonl',
} as const;

export const signal = (): AbortSignal => new AbortController().signal;
