import { expect } from 'bun:test';
import type {
  HookCommandHandler,
  ResolvedHookCommand,
  SubstitutionScope,
} from '../../src/index.ts';
import { resolveHookCommand } from '../../src/index.ts';
import { fakeEnvironment, locations } from './ports.ts';

export const PATHS = {
  CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
  CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
  CLAUDE_PROJECT_DIR: '/work/app',
};

export const userConfig = {
  declared: {
    webhook_url: { type: 'string', title: 'u', description: 'd' },
    api_token: { type: 'string', title: 't', description: 'd', sensitive: true },
  },
  values: { webhook_url: 'https://hooks.example.com', api_token: 's3cret' },
} as const;

export const scopeOf = (overrides: Partial<SubstitutionScope> = {}): SubstitutionScope => ({
  pluginId: 'formatter@acme-tools',
  locations: locations(),
  environment: fakeEnvironment({ NODE_ENV: 'test' }),
  userConfig,
  windows: false,
  ...overrides,
});

export const hook = (
  fields: Partial<HookCommandHandler> & { command: string },
): HookCommandHandler => ({
  type: 'command',
  ...fields,
});

export const resolve = async (
  handler: HookCommandHandler,
  scope = scopeOf(),
): Promise<ResolvedHookCommand> => {
  const { resolved, issues } = await resolveHookCommand(handler, scope);
  expect(issues).toEqual([]);
  if (!resolved) throw new Error('the hook did not resolve');
  return resolved;
};

export const MESSAGE = (command: string) =>
  `Hook from plugin formatter@acme-tools references \${user_config.*} in a shell-form command. The substituted value would be re-parsed by the shell. Use exec form instead — {"command": "<executable>", "args": ["\${user_config.KEY}", ...]} — or read $CLAUDE_PLUGIN_OPTION_<KEY> from the hook's environment. Command: ${command}`;
