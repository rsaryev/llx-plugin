/**
 * Substitution beyond the three path variables. Documented behaviour, tested outside `spec(...)`
 * because no requirement id names it (the component ids belong to the resolvers that call this):
 * - mcp.md § Environment variable expansion in `.mcp.json`: `${VAR}`, `${VAR:-default}`, an unset
 *   variable without a default stays as written and is reported, an empty variable counts as set,
 *   credential variables read as empty in a remote server's `url` and `headers`.
 * - plugins/manifest-reference.md § Reference a saved value, § Fields that run through a shell;
 *   errors.md § plugin-command-references-user-config: `${user_config.KEY}` is never substituted
 *   into a shell field; the check runs on the template.
 * - skills.md § Available string substitutions: substitution runs once over the original text.
 * Wording of issues, the grammar's edges and the option text are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import {
  SENSITIVE_PLACEHOLDER,
  substituteDeep,
  substituteTemplate,
  type FieldPolicy,
  type ResolvedUserConfig,
  type SubstitutionScope,
} from '../../../src/loading/resolve/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';

const OPEN: FieldPolicy = { userConfig: 'allow', environment: 'expand', paths: 'normalized' };
const userConfig: ResolvedUserConfig = {
  declared: {
    api_endpoint: { type: 'string', title: 'Endpoint', description: 'Where' },
    api_token: { type: 'string', title: 'Token', description: 'Secret', sensitive: true },
    retries: { type: 'number', title: 'Retries', description: 'How many', default: 3 },
    verbose: { type: 'boolean', title: 'Verbose', description: 'Chatty' },
    paths: { type: 'string', title: 'Paths', description: 'Many', multiple: true },
    unset: { type: 'string', title: 'Unset', description: 'Nothing saved' },
  },
  values: {
    api_endpoint: 'https://api.example.com',
    api_token: 's3cret',
    verbose: false,
    paths: ['a', 'b'],
    ghost: 'not declared',
  },
};
const scopeOf = (variables: Record<string, string> = {}): SubstitutionScope => ({
  pluginId: 'p',
  locations: locations(),
  environment: fakeEnvironment(variables),
  userConfig,
  windows: false,
});
const run = (template: string, policy: FieldPolicy = OPEN, variables = {}) =>
  substituteTemplate(template, scopeOf(variables), policy, 'hooks.PostToolUse[0].command');

describe('${VAR} and ${VAR:-default}', () => {
  test('a set variable expands, a set empty one too (an empty value is still set)', async () => {
    expect((await run('${API_BASE_URL}/mcp', OPEN, { API_BASE_URL: 'https://x' })).text).toBe(
      'https://x/mcp',
    );
    expect((await run('${API_BASE_URL:-https://d}/mcp', OPEN, { API_BASE_URL: '' })).text).toBe(
      '/mcp',
    );
  });
  test('the default applies only when the variable is unset', async () => {
    expect((await run('${API_BASE_URL:-https://api.example.com}/mcp')).text).toBe(
      'https://api.example.com/mcp',
    );
  });
  test('unset without a default stays as written and is reported as a warning', async () => {
    const result = await run('Bearer ${API_KEY}');
    expect(result.text).toBe('Bearer ${API_KEY}');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      severity: 'warning',
      path: 'hooks.PostToolUse[0].command',
    });
    expect(result.issues[0]?.message).toContain('API_KEY');
  });
  test('where the policy does not expand environment variables, the text is left alone', async () => {
    const result = await run('echo ${HOME}', { ...OPEN, environment: 'literal' }, { HOME: '/h' });
    expect(result).toMatchObject({ text: 'echo ${HOME}', issues: [] });
  });
  test('names the policy reads as empty become empty, even with a default and when set', async () => {
    const policy: FieldPolicy = { ...OPEN, readsAsEmpty: (name) => name === 'NPM_TOKEN' };
    const result = await run('Bearer ${NPM_TOKEN:-fallback}', policy, { NPM_TOKEN: 'abc' });
    expect(result).toMatchObject({ text: 'Bearer ', issues: [] });
  });
});

describe('${user_config.KEY}', () => {
  test('a saved value is substituted', async () => {
    expect((await run('--url=${user_config.api_endpoint}')).text).toBe(
      '--url=https://api.example.com',
    );
  });
  test('the default stands in when nothing is saved; numbers and booleans are written as text', async () => {
    expect((await run('${user_config.retries} ${user_config.verbose}')).text).toBe('3 false');
  });
  test('a list is joined with commas', async () => {
    expect((await run('${user_config.paths}')).text).toBe('a,b');
  });
  test('a sensitive value is substituted where the policy allows it (exec-form args, MCP)', async () => {
    expect((await run('${user_config.api_token}')).text).toBe('s3cret');
  });
  test('a sensitive value becomes a placeholder where only non-sensitive values go', async () => {
    const result = await run('${user_config.api_token}', { ...OPEN, userConfig: 'non-sensitive' });
    expect(result.text).toBe(SENSITIVE_PLACEHOLDER('api_token'));
    expect(result.text).not.toContain('s3cret');
    const plain = await run('${user_config.api_endpoint}', {
      ...OPEN,
      userConfig: 'non-sensitive',
    });
    expect(plain.text).toBe('https://api.example.com');
  });
  test('where the field runs through a shell the reference is never substituted', async () => {
    const result = await run('notify.sh ${user_config.api_endpoint}', {
      ...OPEN,
      userConfig: 'refuse',
    });
    expect(result.text).toBe('notify.sh ${user_config.api_endpoint}');
  });
  test('no value, an undeclared key and a value nobody declared stay as written with a warning', async () => {
    for (const key of ['unset', 'missing', 'ghost']) {
      const result = await run(`\${user_config.${key}}`);
      expect(result.text).toBe(`\${user_config.${key}}`);
      expect(result.issues[0]?.severity).toBe('warning');
    }
  });
});

describe('one pass over the original text', () => {
  test('a substituted value is not scanned again', async () => {
    const scope: SubstitutionScope = {
      ...scopeOf({ SNEAKY: '${CLAUDE_PROJECT_DIR}' }),
      userConfig: {
        declared: { x: { type: 'string', title: 'x', description: 'x' } },
        values: { x: '${CLAUDE_PLUGIN_ROOT}' },
      },
    };
    const result = await substituteTemplate('${SNEAKY} ${user_config.x}', scope, OPEN);
    expect(result.text).toBe('${CLAUDE_PROJECT_DIR} ${CLAUDE_PLUGIN_ROOT}');
  });
  test('text that is not a reference is left as written', async () => {
    const template = 'cost $5, ${not a name}, ${}, $HOME, ${CLAUDE_SKILL_DIR}, ${unterminated';
    expect((await run(template, { ...OPEN, environment: 'literal' })).text).toBe(template);
  });
  test('extra variables the host supplies (skills: ${CLAUDE_SKILL_DIR}) are substituted in the same pass', async () => {
    const scope = { ...scopeOf(), extra: { CLAUDE_SKILL_DIR: '/plugins/p/skills/a' } };
    const result = await substituteTemplate('${CLAUDE_SKILL_DIR}/run.sh', scope, OPEN);
    expect(result.text).toBe('/plugins/p/skills/a/run.sh');
  });
  test('reports what the template referenced, so callers can tell', async () => {
    const result = await run(
      '${CLAUDE_PLUGIN_DATA} ${user_config.api_endpoint} ${A:-b} ${CLAUDE_PLUGIN_DATA}',
    );
    expect(result.referenced).toEqual([
      { kind: 'path-variable', name: 'CLAUDE_PLUGIN_DATA' },
      { kind: 'user-config', key: 'api_endpoint' },
      { kind: 'environment', name: 'A' },
    ]);
  });
  test('a path variable ignores a default written after it', async () => {
    expect((await run('${CLAUDE_PROJECT_DIR:-/elsewhere}')).text).toBe('/work/app');
  });
});

const policyFor = (path: readonly (string | number)[]): FieldPolicy =>
  path[0] === 'keep' ? { ...OPEN, userConfig: 'refuse', paths: 'native' } : OPEN;

describe('substituteDeep', () => {
  test('substitutes every string of a JSON value with the policy of its path', async () => {
    const value = {
      command: '${CLAUDE_PLUGIN_ROOT}/bin/server',
      args: ['--data', '${CLAUDE_PLUGIN_DATA}', 3, true],
      env: { TOKEN: '${user_config.api_token}', MODE: '${MODE:-prod}' },
      keep: '${CLAUDE_PLUGIN_ROOT}',
    };
    const host = locations();
    const result = await substituteDeep(value, { ...scopeOf(), locations: host }, policyFor);
    expect(result.value).toEqual({
      command: '/plugins/p/bin/server',
      args: ['--data', '/data/p', 3, true],
      env: { TOKEN: 's3cret', MODE: 'prod' },
      keep: '/plugins/p',
    });
    expect(host.dataCreated).toEqual(['p']);
  });
  test('issues carry the path of the string they came from', async () => {
    const result = await substituteDeep(
      { env: { A: '${NOPE}' }, args: ['x', '${ALSO_NOPE}'] },
      scopeOf(),
      () => OPEN,
    );
    expect(result.issues.map((issue) => issue.path)).toEqual(['env.A', 'args.1']);
  });
});
