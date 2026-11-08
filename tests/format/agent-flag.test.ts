/**
 * sub-agents.md, "Choose the subagent scope" (CLI-defined subagents): the `--agents` JSON, one
 * definition per name, `prompt` as the system prompt, the frontmatter fields, `color` and
 * `experimental` ignored rather than rejected, a name that must not start with `-`; errors.md,
 * "Invalid --agents configuration". The JSON is already parsed here: the host reads the flag.
 */
import { describe, expect, test } from 'bun:test';
import { readFlagAgents } from '../../src/format/agent-flag.ts';
import { spec } from '../support/spec.ts';

/** The two definitions of the docs' own example. */
const DOCS_EXAMPLE = {
  'code-reviewer': {
    description: 'Expert code reviewer. Use proactively after code changes.',
    prompt: 'You are a senior code reviewer. Focus on code quality, security, and best practices.',
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    model: 'sonnet',
  },
  debugger: {
    description: 'Debugging specialist for errors and test failures.',
    prompt: 'You are an expert debugger. Analyze errors, identify root causes, and provide fixes.',
  },
};

spec('agents.behavior.Choose the subagent scope.--agents', () => {
  test('each top-level key is an agent name and its value the definition (the docs example)', () => {
    const { agents, issues } = readFlagAgents(DOCS_EXAMPLE);
    expect(issues).toEqual([]);
    expect(agents.map((agent) => agent.name)).toEqual(['code-reviewer', 'debugger']);
    const [reviewer, debuggerAgent] = agents;
    expect(reviewer?.source).toBe('flag');
    expect(reviewer?.definition).toEqual({
      description: 'Expert code reviewer. Use proactively after code changes.',
      prompt:
        'You are a senior code reviewer. Focus on code quality, security, and best practices.',
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      model: 'sonnet',
    });
    expect(debuggerAgent?.definition.tools).toBeUndefined();
  });

  test('prompt is the system prompt, like the markdown body of a file; it may be empty', () => {
    const { agents, issues } = readFlagAgents({ quiet: { description: 'Quiet', prompt: '' } });
    expect(issues).toEqual([]);
    expect(agents[0]?.definition.prompt).toBe('');
  });

  test('the frontmatter fields of the docs list are read like a file reads them', () => {
    const { agents } = readFlagAgents({
      worker: {
        description: 'Works',
        prompt: 'Work.',
        disallowedTools: ['Write'],
        permissionMode: 'plan',
        maxTurns: 7,
        skills: ['lint'],
        memory: 'project',
        effort: 'high',
        background: true,
        omitClaudeMd: true,
        isolation: 'worktree',
        initialPrompt: 'Start',
        hooks: { Stop: [{ hooks: [{ type: 'command', command: './done.sh' }] }] },
      },
    });
    expect(agents[0]?.definition).toMatchObject({
      disallowedTools: ['Write'],
      permissionMode: 'plan',
      maxTurns: 7,
      skills: ['lint'],
      memory: 'project',
      effort: 'high',
      background: true,
      omitClaudeMd: true,
      initialPrompt: 'Start',
    });
    expect(agents[0]?.extras.isolation).toBe('worktree');
    expect(agents[0]?.hooks).toBeDefined();
  });

  test('color and experimental are not accepted: ignored, not rejected, and they set nothing', () => {
    const { agents, issues } = readFlagAgents({
      painted: {
        description: 'Painted',
        prompt: 'Paint.',
        color: 'red',
        experimental: { cacheTtl: '1h' },
      },
    });
    expect(issues).toEqual([]);
    expect(agents[0]?.extras).toEqual({});
    expect(agents[0]?.ignored).toEqual(['color', 'experimental']);
  });

  test('a name that starts with "-" is refused with the reason the docs print', () => {
    const { agents, issues } = readFlagAgents({
      '-bad': { description: 'Bad', prompt: 'x' },
      good: { description: 'Good', prompt: 'x' },
    });
    expect(agents.map((agent) => agent.name)).toEqual(['good']);
    expect(issues).toEqual([
      { severity: 'error', path: '--agents', message: "-bad: agent names must not start with '-'" },
    ]);
  });

  test('a value that is not an object, and a definition that is not an object, are errors', () => {
    expect(readFlagAgents('code-reviewer').issues[0]?.severity).toBe('error');
    expect(readFlagAgents([]).issues[0]?.severity).toBe('error');
    const { agents, issues } = readFlagAgents({
      broken: 'text',
      fine: { description: 'd', prompt: '' },
    });
    expect(agents.map((agent) => agent.name)).toEqual(['fine']);
    expect(issues.map((issue) => issue.path)).toEqual(['--agents.broken']);
  });
});

describe('judgments of the --agents reader (spec/judgments.md)', () => {
  test('a definition without a description is refused: the docs call it required for every subagent', () => {
    const { agents, issues } = readFlagAgents({ nameless: { prompt: 'x' } });
    expect(agents).toEqual([]);
    expect(issues[0]?.message).toContain('description');
  });

  test('a definition without a prompt is refused: prompt may be empty but is a field of every definition', () => {
    const { agents, issues } = readFlagAgents({ silent: { description: 'd' } });
    expect(agents).toEqual([]);
    expect(issues[0]?.message).toContain('prompt');
  });

  test('a field no subagent takes is reported as unrecognized, as in a file', () => {
    const { agents } = readFlagAgents({ w: { description: 'd', prompt: '', maxTurn: 3 } });
    expect(agents[0]?.unrecognized).toEqual([{ field: 'maxTurn', suggestion: 'maxTurns' }]);
  });

  test('a name with ":" is refused like a file name (the colon is reserved for plugin scopes)', () => {
    const { agents } = readFlagAgents({ 'a:b': { description: 'd', prompt: '' } });
    expect(agents).toEqual([]);
  });
});
