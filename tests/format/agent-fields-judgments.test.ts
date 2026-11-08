/**
 * What `readAgent` does with the fields the docs leave open (spec/judgments.md), and the wiring
 * of the field registry. None of it counts as compatibility. Where the docs speak (plugin
 * agents ignore four fields, up to five unrecognized fields are named) the claim is still tested
 * here only when no requirement id covers it.
 */
import { describe, expect, test } from 'bun:test';
import { PLUGIN_IGNORED_FIELDS } from '../../src/format/agent-fields.ts';
import { readAgent } from '../../src/format/agent.ts';
import { at, file, loaded, plugin } from '../support/agent-files.ts';

const NAMED = 'name: helper\ndescription: Helps';
const read = (extra: string, origin = at('project')) =>
  readAgent(file(`${NAMED}\n${extra}`), origin);
const pluginRead = (extra: string) => read(extra, plugin(undefined, 'agents/helper.md'));

describe('an invalid value is dropped with a warning and the agent still loads', () => {
  test.each([
    ['color: magenta', 'color'],
    ['isolation: container', 'isolation'],
    ['maxTurns: 0', 'maxTurns'],
    ['maxTurns: -2', 'maxTurns'],
    ['maxTurns: 1.5', 'maxTurns'],
    ['maxTurns: many', 'maxTurns'],
    ['effort: 3', 'effort'],
    ['effort: High', 'effort'],
    ['effort: extreme', 'effort'],
    ['model: [sonnet, opus]', 'model'],
    ['background: maybe', 'background'],
    ['omitClaudeMd: [true]', 'omitClaudeMd'],
    ['memory: global', 'memory'],
    ['initialPrompt: [a]', 'initialPrompt'],
    ['experimental: yes please', 'experimental'],
    ['experimental:\n  cacheTtl: 24h', 'experimental.cacheTtl'],
  ])('%j', (extra, key) => {
    const result = read(extra);
    const agent = loaded(result);
    expect(agent.name).toBe('helper');
    expect(agent.definition).not.toHaveProperty(key);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning', path: 'agents/reviewer.md' });
    expect(result.issues[0]?.message).toContain(`"${key}"`);
  });

  test('the same in a plugin agent: it loads and warns', () => {
    const result = pluginRead('color: magenta\nmaxTurns: 0');
    expect(result.issues).toHaveLength(2);
    expect(loaded(result).extras).toEqual({});
  });

  test('an empty value is the same as an absent one: nothing is set or reported', () => {
    const result = read('color:\nmodel: ""\nmaxTurns: null');
    expect(result.issues).toEqual([]);
    expect(loaded(result).extras).toEqual({});
    expect(loaded(result).definition).toEqual({
      description: 'Helps',
      prompt: 'You are a reviewer.\n',
    });
  });

  test('a plain integer scalar written as a string still counts: maxTurns: "8"', () => {
    expect(loaded(read('maxTurns: "8"')).definition.maxTurns).toBe(8);
  });

  test('a flag is a YAML boolean or the text true or false, in any case', () => {
    expect(loaded(read('background: true')).definition.background).toBe(true);
    expect(loaded(read('background: "TRUE"')).definition.background).toBe(true);
    expect(loaded(read('omitClaudeMd: "false"')).definition.omitClaudeMd).toBe(false);
  });

  test.each(['yes', 'on', 'off', 'no', '1', '0', '"yes"', '"1"', '2'])(
    'background: %s is not a flag here: dropped with a warning',
    (written) => {
      const result = read(`background: ${written}`);
      expect(loaded(result).definition).not.toHaveProperty('background');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.message).toContain('is not a flag');
    },
  );
});

describe('autoCompactWindow reads a string as its leading integer', () => {
  test.each([
    ['200000 tokens', 200_000],
    ['"250000"', 250_000],
  ])('%s is read as %d and kept', (written, tokens) => {
    const result = read(`autoCompactWindow: ${written}`);
    expect(loaded(result).definition.autoCompactWindow).toBe(tokens);
    expect(result.issues).toEqual([]);
  });

  test.each(['big', '[200000]', '200000.5', '"200000.5"', '"200000.5 tokens"', 'true'])(
    '%s is not a token count: ignored with a report',
    (written) => {
      const result = read(`autoCompactWindow: ${written}`);
      expect(loaded(result).definition).not.toHaveProperty('autoCompactWindow');
      expect(result.issues[0]?.message).toContain('invalid autoCompactWindow');
    },
  );

  test('the report says what the value was read as', () => {
    expect(read('autoCompactWindow: 200k').issues[0]?.message).toContain('read as 200');
  });
});

describe('the experimental map', () => {
  test('a cacheTtl of another case is not 5m or 1h', () => {
    expect(loaded(read('experimental:\n  cacheTtl: 1H')).extras).toEqual({});
  });

  test('an empty map sets nothing and reports nothing', () => {
    const result = read('experimental: {}');
    expect(loaded(result).extras).toEqual({});
    expect(result.issues).toEqual([]);
  });
});

describe('a plugin agent ignores permissionMode, hooks, mcpServers and initialPrompt', () => {
  test('the registry lists exactly those four', () => {
    expect([...PLUGIN_IGNORED_FIELDS]).toEqual([
      'permissionMode',
      'mcpServers',
      'hooks',
      'initialPrompt',
    ]);
  });

  test('each present one is named in ignored, reaches no definition and is not even validated', () => {
    const result = pluginRead(
      [
        'permissionMode: bypassPermissions',
        'initialPrompt: Go',
        'mcpServers:\n  - slack',
        'hooks:\n  PreToolUse: not a list',
      ].join('\n'),
    );
    const agent = loaded(result);
    expect(agent.ignored).toEqual(['permissionMode', 'mcpServers', 'hooks', 'initialPrompt']);
    expect(agent.definition).toEqual({ description: 'Helps', prompt: 'You are a reviewer.\n' });
    expect(agent.hooks).toBeUndefined();
    expect(result.issues).toEqual([]);
    expect(agent.unrecognized).toEqual([]);
  });

  test('a file agent applies all four and ignores none', () => {
    const agent = loaded(
      read('permissionMode: plan\ninitialPrompt: Go\nmcpServers:\n  - slack\nhooks: {}'),
    );
    expect(agent.ignored).toEqual([]);
    expect(agent.definition).toMatchObject({
      permissionMode: 'plan',
      initialPrompt: 'Go',
      mcpServers: ['slack'],
    });
    expect(agent.hooks).toEqual({});
  });

  test('frontmatter that does not parse gives a plugin agent no fields at all', () => {
    const agent = loaded(readAgent('---\nname: [oops\n---\nBody', plugin()));
    expect(agent.ignored).toEqual([]);
    expect(agent.definition.description).toBe('Agent from my-plugin plugin');
    expect(agent.extras).toEqual({});
  });
});

describe('the registry reads the fields other sub-packages resolve', () => {
  test('tools, disallowedTools and skills take a comma string or a YAML list', () => {
    const agent = loaded(
      read(
        'tools: Read, Grep, Bash(git push *)\ndisallowedTools:\n  - Edit\n  - Write\nskills: [api-conventions, lint]',
      ),
    );
    expect(agent.definition).toMatchObject({
      tools: ['Read', 'Grep', 'Bash(git push *)'],
      disallowedTools: ['Edit', 'Write'],
      skills: ['api-conventions', 'lint'],
    });
  });

  test('memory takes user, project or local', () => {
    expect(loaded(read('memory: project')).definition.memory).toBe('project');
  });

  test('permissionMode reads manual as default and a mode as itself', () => {
    expect(loaded(read('permissionMode: manual')).definition.permissionMode).toBe('default');
    expect(loaded(read('permissionMode: dontAsk')).definition.permissionMode).toBe('dontAsk');
    const result = read('permissionMode: yolo');
    expect(loaded(result).definition).not.toHaveProperty('permissionMode');
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
  });

  test('hooks take the settings format; a bad one is reported and keeps no hook', () => {
    const ok = loaded(
      read(
        'hooks:\n  PreToolUse:\n    - matcher: Bash\n      hooks:\n        - type: command\n          command: ./check.sh',
      ),
    );
    expect(ok.hooks?.PreToolUse?.[0]?.matcher).toBe('Bash');
    const bad = read('hooks:\n  PreToolUse: nope');
    expect(loaded(bad).hooks).toBeUndefined();
    expect(bad.issues.length).toBeGreaterThan(0);
  });

  test('mcpServers keeps a name or an inline definition and drops anything else', () => {
    const agent = loaded(
      read(
        'mcpServers:\n  - slack\n  - playwright:\n      type: stdio\n      command: npx\n  - 42',
      ),
    );
    expect(agent.definition.mcpServers).toEqual([
      'slack',
      { playwright: { type: 'stdio', command: 'npx' } },
    ]);
  });

  test('mcpServers drops an empty inline definition', () => {
    const result = read('mcpServers:\n  - {}\n  - slack');
    expect(loaded(result).definition.mcpServers).toEqual(['slack']);
    expect(result.issues).toHaveLength(1);
  });
});

describe('fields only Claude Code defines never come from a file', () => {
  test('the SDK keys the docs do not list as frontmatter stay unset and are unrecognized', () => {
    const agent = loaded(
      read(
        'observer: watcher\nobserverMessage: hi\ncriticalSystemReminder_EXPERIMENTAL: be careful',
      ),
    );
    expect(agent.definition).toEqual({ description: 'Helps', prompt: 'You are a reviewer.\n' });
    expect(agent.unrecognized.map((entry) => entry.field)).toEqual([
      'observer',
      'observerMessage',
      'criticalSystemReminder_EXPERIMENTAL',
    ]);
  });
});

describe('unrecognized fields (sub-agents.md: the debug log names up to five)', () => {
  test('a supported field written with the wrong case or a slip gets the likely name', () => {
    const agent = loaded(read('maxturns: 3\ndisalowedTools: Bash\ncolour: red'));
    expect(agent.unrecognized).toEqual([
      { field: 'maxturns', suggestion: 'maxTurns' },
      { field: 'disalowedTools', suggestion: 'disallowedTools' },
      { field: 'colour', suggestion: 'color' },
    ]);
    expect(agent.definition).not.toHaveProperty('maxTurns');
  });

  test('a field that is not close to any gets no suggestion', () => {
    expect(loaded(read('temperature: 0.2')).unrecognized).toEqual([{ field: 'temperature' }]);
  });

  test('only the first five are named, in file order', () => {
    const agent = loaded(read('a1: 1\na2: 2\na3: 3\na4: 4\na5: 5\na6: 6'));
    expect(agent.unrecognized.map((entry) => entry.field)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  test('every supported field is recognized, and a recognized field never gets a report', () => {
    const agent = loaded(read('model: opus\nexperimental: {}\ninitialPrompt: x'));
    expect(agent.unrecognized).toEqual([]);
  });
});
