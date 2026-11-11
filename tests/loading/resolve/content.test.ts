/**
 * plugins/manifest-reference.md § Where each variable resolves (Skill, command, and agent content:
 * `${...}` resolves "Anywhere in the Markdown body"; the process variables are "Not applicable";
 * "In skill, command, and agent content, write the `${...}` reference in the Markdown body instead,
 * and Claude Code substitutes the path inline when it loads the content"), § Reference a saved
 * value ("In skill and agent content, only non-sensitive values are substituted, and a sensitive
 * value there becomes a placeholder"), § Quoting and path separators (forward slashes on Windows);
 * skills.md § Available string substitutions (`${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}`
 * in plugin skills, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, "A backslash
 * doesn't prevent substitution of a `${CLAUDE_*}` variable", a substituted value is not scanned
 * again); plugins/components.md § Path variables and persistent data ("created when first referenced").
 *
 * The kit substitutes the body it is given: splitting off the frontmatter, `$ARGUMENTS` and the
 * `allowed-tools` rules belong to the skills stream.
 */
import { describe, expect, test } from 'bun:test';
import {
  SENSITIVE_PLACEHOLDER,
  substituteContent,
  type SubstitutionScope,
} from '../../../src/entry/loading.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { windowsLocations } from '../../support/windows-locations.ts';

const PATHS = {
  CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
  CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
  CLAUDE_PROJECT_DIR: '/work/app',
};

const scopeOf = (overrides: Partial<SubstitutionScope> = {}): SubstitutionScope => ({
  pluginId: 'formatter@acme-tools',
  locations: locations(),
  environment: fakeEnvironment({ HOME: '/home/user', NODE_ENV: 'test' }),
  userConfig: {
    declared: {
      region: { type: 'string', title: 'r', description: 'd' },
      api_token: { type: 'string', title: 't', description: 'd', sensitive: true },
    },
    values: { region: 'eu', api_token: 's3cret' },
  },
  windows: false,
  ...overrides,
});

const body = async (markdown: string, scope = scopeOf()): Promise<string> => {
  const { text, issues } = await substituteContent(markdown, scope);
  expect(issues).toEqual([]);
  return text;
};

spec('environment.component.Skill, command, and agent content', () => {
  test('the three path variables resolve anywhere in the body: prose, headings, code, links, every occurrence', async () => {
    const markdown = [
      '# Run ${CLAUDE_PLUGIN_ROOT}',
      '',
      'Use `${CLAUDE_PLUGIN_ROOT}/scripts/render.sh` and ${CLAUDE_PLUGIN_ROOT}/b.',
      '',
      '```bash',
      'cd "${CLAUDE_PLUGIN_DATA}" && ls ${CLAUDE_PROJECT_DIR}',
      '```',
      '',
      '[config](${CLAUDE_PROJECT_DIR}/.claude/config.json) - ${CLAUDE_PLUGIN_DATA}',
    ].join('\n');
    expect(await body(markdown)).toBe(
      [
        `# Run ${PATHS.CLAUDE_PLUGIN_ROOT}`,
        '',
        `Use \`${PATHS.CLAUDE_PLUGIN_ROOT}/scripts/render.sh\` and ${PATHS.CLAUDE_PLUGIN_ROOT}/b.`,
        '',
        '```bash',
        `cd "${PATHS.CLAUDE_PLUGIN_DATA}" && ls ${PATHS.CLAUDE_PROJECT_DIR}`,
        '```',
        '',
        `[config](${PATHS.CLAUDE_PROJECT_DIR}/.claude/config.json) - ${PATHS.CLAUDE_PLUGIN_DATA}`,
      ].join('\n'),
    );
  });

  test('the data folder is created only when the body references it', async () => {
    const without = locations();
    await body('${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PROJECT_DIR}', scopeOf({ locations: without }));
    expect(without.dataCreated).toEqual([]);
    const withData = locations();
    await body(
      '${CLAUDE_PLUGIN_DATA} and again ${CLAUDE_PLUGIN_DATA}',
      scopeOf({ locations: withData }),
    );
    expect(withData.dataCreated).toEqual(['formatter-acme-tools']);
  });

  test('on Windows the substituted paths use forward slashes', async () => {
    const windows = scopeOf({ locations: windowsLocations(), windows: true });
    expect(await body('${CLAUDE_PROJECT_DIR}/x ${CLAUDE_PLUGIN_ROOT}', windows)).toBe(
      'C:/Users/you/app/x C:/Users/you/.claude/plugins/cache/formatter@acme-tools',
    );
  });

  test('a body with no reference comes back unchanged', async () => {
    const markdown = 'Plain $1 text with $ARGUMENTS and {braces} and ${ and ${} here.';
    expect(await body(markdown)).toBe(markdown);
  });
});

describe('${user_config.KEY} in content (manifest-reference § Reference a saved value)', () => {
  test('a non-sensitive value is substituted in the body', async () => {
    expect(await body('Deploy to ${user_config.region}.')).toBe('Deploy to eu.');
  });

  test('a sensitive value becomes a placeholder and never appears', async () => {
    const text = await body('Token: ${user_config.api_token}');
    expect(text).toBe(`Token: ${SENSITIVE_PLACEHOLDER('api_token')}`);
    expect(text).not.toContain('s3cret');
  });

  test('a substituted value is not scanned again', async () => {
    const scope = scopeOf({
      userConfig: {
        declared: { region: { type: 'string', title: 'r', description: 'd' } },
        values: { region: '${CLAUDE_PLUGIN_ROOT}' },
      },
    });
    expect(await body('${user_config.region}', scope)).toBe('${CLAUDE_PLUGIN_ROOT}');
  });

  test('an option with no value stays as written and is reported as a warning', async () => {
    const scope = scopeOf({
      userConfig: {
        declared: { region: { type: 'string', title: 'r', description: 'd' } },
        values: {},
      },
    });
    const { text, issues } = await substituteContent('in ${user_config.region}', scope, 'skills/a');
    expect(text).toBe('in ${user_config.region}');
    expect(issues).toEqual([
      { severity: 'warning', path: 'skills/a', message: '${user_config.region} has no value' },
    ]);
  });
});

describe('content substitution (skills.md, judgments in spec/judgments.md)', () => {
  test('variables a skill supplies (CLAUDE_SKILL_DIR, CLAUDE_SESSION_ID, CLAUDE_EFFORT) go through the same pass', async () => {
    const scope = scopeOf({
      extra: {
        CLAUDE_SKILL_DIR: '/plugins/formatter@acme-tools/skills/render-chart',
        CLAUDE_SESSION_ID: 's-1',
        CLAUDE_EFFORT: 'high',
      },
    });
    expect(
      await body(
        'Run `${CLAUDE_SKILL_DIR}/scripts/render.sh` in ${CLAUDE_SESSION_ID} at ${CLAUDE_EFFORT}; plugin ${CLAUDE_PLUGIN_ROOT}',
        scope,
      ),
    ).toBe(
      'Run `/plugins/formatter@acme-tools/skills/render-chart/scripts/render.sh` in s-1 at high; plugin /plugins/formatter@acme-tools',
    );
  });

  test('a backslash does not prevent substitution of a ${CLAUDE_*} variable', async () => {
    expect(await body('\\${CLAUDE_PLUGIN_ROOT}')).toBe(`\\${PATHS.CLAUDE_PLUGIN_ROOT}`);
  });

  test('${VAR} of the environment is left as written (judgment: the docs expand it nowhere in content)', async () => {
    expect(await body('home ${HOME} ${NODE_ENV:-x}')).toBe('home ${HOME} ${NODE_ENV:-x}');
  });

  test('a reference nobody provides stays as written without a warning', async () => {
    expect(await body('${CLAUDE_UNKNOWN} ${NOT A REF}')).toBe('${CLAUDE_UNKNOWN} ${NOT A REF}');
  });

  test('the references found are reported once each, in order', async () => {
    const { referenced } = await substituteContent(
      '${CLAUDE_PROJECT_DIR} ${user_config.region} ${CLAUDE_PROJECT_DIR}',
      scopeOf(),
    );
    expect(referenced).toEqual([
      { kind: 'path-variable', name: 'CLAUDE_PROJECT_DIR' },
      { kind: 'user-config', key: 'region' },
    ]);
  });
});
