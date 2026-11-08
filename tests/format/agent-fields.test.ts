/**
 * sub-agents.md, "Frontmatter reference" (the rows for `model`, `maxTurns`, `autoCompactWindow`,
 * `background`, `omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt` and
 * `experimental`), "Set the auto-compact window for one subagent" and "Choose a model";
 * plugins/components.md, "Frontmatter fields in plugin agents" (which fields a plugin agent
 * supports and which it ignores). The parse side: what `readAgent` keeps of each field.
 */
import { describe, expect, test } from 'bun:test';
import { AGENT_FIELDS, AGENT_FIELD_NAMES } from '../../src/format/agent-fields.ts';
import { readAgent } from '../../src/format/agent.ts';
import { at, file, FILES, loaded, plugin } from '../support/agent-files.ts';
import { spec } from '../support/spec.ts';

const NAMED = 'name: helper\ndescription: Helps';
const read = (extra: string, origin = at('project')) =>
  readAgent(file(`${NAMED}\n${extra}`), origin);
const pluginRead = (extra: string) => read(extra, plugin(undefined, 'agents/helper.md'));

spec('agents.frontmatter.model', () => {
  test.each(['sonnet', 'opus', 'haiku', 'fable', 'claude-opus-5-5', 'claude-sonnet-5', 'inherit'])(
    'model: %s is kept as written',
    (model) => {
      const result = read(`model: ${model}`);
      expect(loaded(result).definition.model).toBe(model);
      expect(result.issues).toEqual([]);
    },
  );

  test('omitting it leaves the definition without a model, so the subagent model order decides', () => {
    expect(loaded(read('')).definition).not.toHaveProperty('model');
  });

  test('a plugin agent supports it', () => {
    expect(AGENT_FIELDS.model.plugin).toBe('supported');
    const agent = loaded(pluginRead('model: haiku'));
    expect(agent.definition.model).toBe('haiku');
    expect(agent.ignored).toEqual([]);
  });
});

spec('agents.frontmatter.maxTurns', () => {
  test('a count of agentic turns is kept as a number', () => {
    expect(loaded(read('maxTurns: 12')).definition.maxTurns).toBe(12);
  });

  test('a plugin agent supports it', () => {
    expect(AGENT_FIELDS.maxTurns.plugin).toBe('supported');
    expect(loaded(pluginRead('maxTurns: 3')).definition.maxTurns).toBe(3);
  });
});

spec('agents.frontmatter.autoCompactWindow', () => {
  test('the documented example: 200000 is kept', () => {
    const result = readAgent(
      file(
        'name: log-reader\ndescription: Reads long log files and reports the errors it finds\nautoCompactWindow: 200000',
      ),
      at('user'),
    );
    expect(loaded(result).definition.autoCompactWindow).toBe(200_000);
    expect(result.issues).toEqual([]);
  });

  test.each([100_000, 1_000_000])('%d, an end of the allowed range, is kept', (tokens) => {
    expect(loaded(read(`autoCompactWindow: ${tokens}`)).definition.autoCompactWindow).toBe(tokens);
  });

  test('200k reads as 200, outside the range: the subagent still loads as if the field were absent', () => {
    const result = read('autoCompactWindow: 200k');
    const agent = loaded(result);
    expect(agent.definition).not.toHaveProperty('autoCompactWindow');
    expect(agent.name).toBe('helper');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toContain('invalid autoCompactWindow');
  });

  test.each([99_999, 1_000_001, 200])(
    '%d is outside 100000 to 1000000 and is ignored with the same report',
    (tokens) => {
      const result = read(`autoCompactWindow: ${tokens}`);
      expect(loaded(result).definition).not.toHaveProperty('autoCompactWindow');
      expect(result.issues[0]?.message).toContain('invalid autoCompactWindow');
    },
  );

  test('a plugin agent supports it, and ignores a value out of range too', () => {
    expect(AGENT_FIELDS.autoCompactWindow.plugin).toBe('supported');
    expect(loaded(pluginRead('autoCompactWindow: 150000')).definition.autoCompactWindow).toBe(
      150_000,
    );
    const result = pluginRead('autoCompactWindow: 200k');
    expect(loaded(result).definition).not.toHaveProperty('autoCompactWindow');
    expect(result.issues[0]?.message).toContain('invalid autoCompactWindow');
  });
});

spec('agents.frontmatter.background', () => {
  test('true keeps the subagent in the background', () => {
    expect(loaded(read('background: true')).definition.background).toBe(true);
  });

  test('false is kept as false', () => {
    expect(loaded(read('background: false')).definition.background).toBe(false);
  });

  test('a plugin agent supports it', () => {
    expect(AGENT_FIELDS.background.plugin).toBe('supported');
    expect(loaded(pluginRead('background: true')).definition.background).toBe(true);
  });
});

spec('agents.frontmatter.omitClaudeMd', () => {
  test('true starts the subagent without the CLAUDE.md files', () => {
    expect(loaded(read('omitClaudeMd: true')).definition.omitClaudeMd).toBe(true);
  });

  test('omitted, the definition does not set it: CLAUDE.md files load', () => {
    expect(loaded(read('')).definition).not.toHaveProperty('omitClaudeMd');
  });

  test('a plugin agent supports it', () => {
    expect(AGENT_FIELDS.omitClaudeMd.plugin).toBe('supported');
    expect(loaded(pluginRead('omitClaudeMd: true')).definition.omitClaudeMd).toBe(true);
  });
});

spec('agents.frontmatter.effort', () => {
  test.each(['low', 'medium', 'high', 'xhigh', 'max'])('effort: %s is kept', (level) => {
    const result = read(`effort: ${level}`);
    expect(loaded(result).definition.effort).toBe(level);
    expect(result.issues).toEqual([]);
  });

  test('a level that is not in the list is not applied', () => {
    expect(loaded(read('effort: extreme')).definition).not.toHaveProperty('effort');
  });

  test('a plugin agent supports it', () => {
    expect(AGENT_FIELDS.effort.plugin).toBe('supported');
    expect(loaded(pluginRead('effort: high')).definition.effort).toBe('high');
  });
});

describe.each(FILES)('isolation in a %s agent', (source) => {
  spec('agents.frontmatter.isolation', () => {
    test('worktree runs the subagent in a temporary git worktree', () => {
      expect(loaded(read('isolation: worktree', at(source))).extras.isolation).toBe('worktree');
    });
  });
});

spec('agents.frontmatter.isolation', () => {
  test('a plugin agent supports it; the only valid value is "worktree"', () => {
    expect(AGENT_FIELDS.isolation.plugin).toBe('supported');
    expect(loaded(pluginRead('isolation: worktree')).extras.isolation).toBe('worktree');
    expect(loaded(pluginRead('isolation: container')).extras).not.toHaveProperty('isolation');
  });

  test('omitted, no isolation is set', () => {
    expect(loaded(read('')).extras).not.toHaveProperty('isolation');
  });
});

spec('agents.frontmatter.color', () => {
  test.each(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'])(
    'color: %s is accepted',
    (color) => {
      const result = read(`color: ${color}`);
      expect(loaded(result).extras.color).toBe(color);
      expect(result.issues).toEqual([]);
    },
  );

  test('a color outside the eight is not applied', () => {
    expect(loaded(read('color: magenta')).extras).not.toHaveProperty('color');
  });

  test('a plugin agent supports it', () => {
    expect(AGENT_FIELDS.color.plugin).toBe('supported');
    expect(loaded(pluginRead('color: cyan')).extras.color).toBe('cyan');
  });
});

spec('agents.frontmatter.initialPrompt', () => {
  test.each(FILES)(
    'a %s agent keeps it, to prepend to the user prompt when it runs as the main agent',
    (source) => {
      const agent = loaded(read('initialPrompt: /review the open changes', at(source)));
      expect(agent.definition.initialPrompt).toBe('/review the open changes');
      expect(agent.ignored).toEqual([]);
    },
  );

  test('a plugin agent ignores it: it is reported as ignored and never reaches the definition', () => {
    expect(AGENT_FIELDS.initialPrompt.plugin).toBe('ignored');
    const result = pluginRead('initialPrompt: Start by listing the files');
    const agent = loaded(result);
    expect(agent.definition).not.toHaveProperty('initialPrompt');
    expect(agent.ignored).toEqual(['initialPrompt']);
    expect(result.issues).toEqual([]);
  });
});

spec('agents.frontmatter.experimental', () => {
  test.each(['5m', '1h'])('experimental.cacheTtl: %s is kept', (ttl) => {
    const result = read(`experimental:\n  cacheTtl: ${ttl}`);
    expect(loaded(result).extras.cacheTtl).toBe(ttl);
    expect(result.issues).toEqual([]);
  });

  test('the documented example: repo-auditor with cacheTtl 1h', () => {
    const result = readAgent(
      file(
        'name: repo-auditor\ndescription: Audits a large repository and reports what it finds\nexperimental:\n  cacheTtl: 1h',
      ),
      at('project'),
    );
    expect(loaded(result).extras.cacheTtl).toBe('1h');
  });

  test('any other cacheTtl value is ignored', () => {
    const agent = loaded(read('experimental:\n  cacheTtl: 24h'));
    expect(agent.extras).not.toHaveProperty('cacheTtl');
  });

  test('any other key of the map is ignored without a report', () => {
    const result = read('experimental:\n  cacheTtl: 1h\n  fancyMode: true');
    expect(loaded(result).extras).toEqual({ cacheTtl: '1h' });
    expect(result.issues).toEqual([]);
  });

  test('cacheTtl at the top level of the frontmatter is not read: it belongs inside the map', () => {
    const agent = loaded(read('cacheTtl: 1h'));
    expect(agent.extras).not.toHaveProperty('cacheTtl');
    expect(agent.unrecognized).toEqual([{ field: 'cacheTtl' }]);
  });

  test('a plugin agent supports the cacheTtl key', () => {
    expect(AGENT_FIELDS.experimental.plugin).toBe('supported');
    const agent = loaded(pluginRead('experimental:\n  cacheTtl: 5m'));
    expect(agent.extras.cacheTtl).toBe('5m');
    expect(agent.ignored).toEqual([]);
  });
});

describe('the field table (plugins/components.md, "Frontmatter fields in plugin agents")', () => {
  const SUPPORTED = [
    'name',
    'description',
    'model',
    'effort',
    'maxTurns',
    'autoCompactWindow',
    'tools',
    'disallowedTools',
    'skills',
    'memory',
    'background',
    'omitClaudeMd',
    'isolation',
    'color',
    'experimental',
  ] as const;
  const IGNORED = ['permissionMode', 'hooks', 'mcpServers', 'initialPrompt'] as const;

  test('the registry names the 19 documented fields', () => {
    expect([...AGENT_FIELD_NAMES].toSorted()).toEqual([...SUPPORTED, ...IGNORED].toSorted());
  });

  test.each(SUPPORTED)('a plugin agent supports %s', (field) => {
    expect(AGENT_FIELDS[field].plugin).toBe('supported');
  });

  test.each(IGNORED)('a plugin agent ignores %s', (field) => {
    expect(AGENT_FIELDS[field].plugin).toBe('ignored');
  });
});
