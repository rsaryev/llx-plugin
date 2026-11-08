/** Judgments of `readAgent` the docs leave open (spec/judgments.md); never counted as compatibility. */
import { describe, expect, test } from 'bun:test';
import { readAgent } from '../../src/format/agent.ts';
import type { AgentOrigin } from '../../src/format/agent-record.ts';
import { at, file, loaded, plugin } from '../support/agent-files.ts';

describe('judgments the docs leave open (spec/judgments.md)', () => {
  test('a plugin agent with a name but no description loads with the fallback description and a warning', () => {
    const result = readAgent(file('name: helper'), plugin(undefined, 'agents/helper.md'));
    expect(loaded(result).definition.description).toBe('Agent from my-plugin plugin');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
    expect(result.issues[0]?.message).toContain('description');
  });

  test('a plugin name with ":" or a leading "-" is kept as written: the docs give only the length fallback', () => {
    const colon = readAgent(file('name: a:b\ndescription: d'), plugin(undefined, 'agents/x.md'));
    expect(loaded(colon).scopedName).toBe('my-plugin:a:b');
    const dash = readAgent(file('name: -a\ndescription: d'), plugin(undefined, 'agents/x.md'));
    expect(loaded(dash).name).toBe('-a');
  });

  test('a plugin name that is not text falls back to the file name with a warning', () => {
    const result = readAgent(
      file('name: [a, b]\ndescription: d'),
      plugin(undefined, 'agents/x.md'),
    );
    expect(loaded(result).name).toBe('x');
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
  });

  test('a blank name is no name: documentation in a project file, the file name in a plugin', () => {
    for (const blank of ['name:', 'name: ""', 'name: "   "', 'name: null']) {
      const result = readAgent(file(`${blank}\ndescription: d`), at('project'));
      expect(result).toEqual({
        outcome: 'skipped',
        reason: 'documentation',
        agent: undefined,
        issues: [],
      });
      const inPlugin = readAgent(
        file(`${blank}\ndescription: d`),
        plugin(undefined, 'agents/x.md'),
      );
      expect(loaded(inPlugin).name).toBe('x');
      expect(inPlugin.issues).toEqual([]);
    }
  });

  test('name and description are trimmed text', () => {
    const agent = loaded(readAgent(file('name: "  a  "\ndescription: "  d  "'), at('user')));
    expect(agent.name).toBe('a');
    expect(agent.definition.description).toBe('d');
  });

  test('a plugin description that is not text falls back with a warning that says why', () => {
    const result = readAgent(
      file('name: helper\ndescription: [a, b]'),
      plugin(undefined, 'agents/helper.md'),
    );
    expect(loaded(result).definition.description).toBe('Agent from my-plugin plugin');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
    expect(result.issues[0]?.message).toContain('is not text');
    expect(result.issues[0]?.message).not.toContain('is missing');
  });

  test('a file in an --add-dir directory is read as a project file', () => {
    const origin: AgentOrigin = { source: 'project', path: '/other/.claude/agents/x.md' };
    const agent = loaded(readAgent(file('name: x\ndescription: d'), origin));
    expect(agent.source).toBe('project');
    expect(agent.scopedName).toBe('x');
  });

  test('the --agents flag is JSON, so a file read takes no flag source', () => {
    // @ts-expect-error `flag` is a source for hookAgentType only, never of a file
    const origin: AgentOrigin = { source: 'flag', path: 'agents/x.md' };
    expect(origin).toBeDefined();
  });

  test('a plugin file named .md keeps .md as its name, not an empty one', () => {
    const agent = loaded(readAgent(file('description: d'), plugin('.md', 'agents/.md')));
    expect(agent.name).toBe('.md');
    expect(agent.scopedName).toBe('my-plugin:.md');
  });

  test('a name that is not text in a project file is invalid, not documentation', () => {
    const result = readAgent(file('name: [a, b]\ndescription: d'), at('project'));
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid' });
  });

  test('a number is read as its text, like every frontmatter text field', () => {
    const agent = loaded(readAgent(file('name: 2024\ndescription: d'), at('project')));
    expect(agent.name).toBe('2024');
  });

  test('frontmatter that is a list, not a table, is handled like YAML that does not parse', () => {
    expect(readAgent('---\n- a\n- b\n---\nbody', at('project'))).toMatchObject({
      outcome: 'skipped',
      reason: 'invalid',
    });
    const inPlugin = readAgent('---\n- a\n---\nbody', plugin(undefined, 'agents/x.md'));
    expect(loaded(inPlugin).definition.description).toBe('Agent from my-plugin plugin');
  });

  test('a parse issue names the line of the YAML problem', () => {
    const result = readAgent('---\nname: a\nb: c: d\n---\n', at('user'));
    expect(result.issues[0]?.message).toContain('line 3');
  });

  test('the prompt is the body exactly as written, and the other record fields start empty', () => {
    const agent = loaded(readAgent(file('name: a\ndescription: d', '\n\nBody\n\n'), at('user')));
    expect(agent.definition.prompt).toBe('\n\nBody\n\n');
    expect(agent).toMatchObject({ extras: {}, hooks: undefined, ignored: [], unrecognized: [] });
  });
});
