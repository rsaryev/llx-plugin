import { fakeEnvironment, locations } from './ports.ts';
import type { ResolvedUserConfig, SubstitutionScope } from '../../src/entry/loading.ts';

export const userConfig: ResolvedUserConfig = {
  declared: {
    api_token: { type: 'string', title: 't', description: 'd', sensitive: true },
    region: { type: 'string', title: 'r', description: 'd' },
  },
  values: { api_token: 's3cret', region: 'eu' },
};
export const scopeOf = (overrides: Partial<SubstitutionScope> = {}): SubstitutionScope => ({
  pluginId: 'my-plugin@acme-tools',
  locations: locations(),
  environment: fakeEnvironment({ DB_URL: 'postgres://db', ANTHROPIC_AUTH_TOKEN: 'tok' }),
  userConfig,
  windows: false,
  ...overrides,
});
export const PATHS = {
  CLAUDE_PLUGIN_ROOT: '/plugins/my-plugin@acme-tools',
  CLAUDE_PLUGIN_DATA: '/data/my-plugin-acme-tools',
  CLAUDE_PROJECT_DIR: '/work/app',
};
export const HELPER_MESSAGE = (name: string) =>
  `headersHelper for MCP server '${name}' references \${user_config.*}. The substituted value would be passed to a shell; read the value inside the helper script instead (e.g. from an env var set in the server's "env" block).`;
