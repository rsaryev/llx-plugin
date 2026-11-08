/**
 * cli-reference.md § CLI flags (`--agent`: an agent for the current session, overriding the `agent`
 * setting; `--agents`: subagents as JSON, with `--print` the path to a JSON file, validated at
 * startup; `--append-subagent-system-prompt` and its `-file` form: text appended to every subagent's
 * system prompt, only with `-p`, never both; `--forward-subagent-text`: requires `--print` and
 * `--output-format stream-json`), sub-agents.md § Choose the subagent scope (an agent's `prompt` may
 * be empty, a name must not start with `-`, `color` and `experimental` are ignored) and errors.md §
 * Invalid `--agents` configuration, § Conflict between a system-prompt flag and its file form (the
 * messages and the order of the checks; `--safe-mode` ignores `--agents` entirely). The effect of a
 * flag whose requirement is missing is outside `spec(...)`. Native prompt/stream flags are
 * regression tests of optional host helpers, not plugin-host compatibility (spec/scope-audit.md).
 */
import { describe, expect, test } from 'bun:test';
import { file, planOf, printFacts } from '../support/session-flags.ts';
import { spec } from '../support/spec.ts';

const REVIEWER = '{"reviewer":{"description":"Reviews code","prompt":"You are a code reviewer"}}';

spec('cli.flag.--agent', () => {
  test('names the agent for the current session when no setting does', () => {
    expect(planOf({ '--agent': 'my-custom-agent' }).agent).toBe('my-custom-agent');
  });

  test('overrides the agent setting; without the flag the setting stands', () => {
    expect(planOf({ '--agent': 'reviewer' }, { agentSetting: 'writer' }).agent).toBe('reviewer');
    expect(planOf({}, { agentSetting: 'writer' }).agent).toBe('writer');
  });

  test('a plugin agent is named by its scoped name, subfolders included, and still wins over the setting', () => {
    const plan = planOf({ '--agent': 'my-plugin:review:security' }, { agentSetting: 'writer' });
    expect(plan.agent).toBe('my-plugin:review:security');
  });

  test('no flag and no setting, no agent', () => {
    expect(planOf({}).agent).toBeUndefined();
  });
});

const run = (value: string, extra = {}) => planOf({ '--agents': value }, extra);
const message = (value: string, extra = {}): string => run(value, extra).refusals[0] ?? '';

describe('--agents', () => {
  spec(['cli.flag.--agents', 'cli.errors.Invalid --agents configuration'], () => {
    test('defines subagents from inline JSON keyed by name', () => {
      const plan = run(REVIEWER);
      expect(plan.refusals).toEqual([]);
      expect(plan.cliAgents).toEqual({
        reviewer: { description: 'Reviews code', prompt: 'You are a code reviewer' },
      });
    });

    test('takes the fields of a CLI-defined subagent; color and experimental are ignored, not rejected', () => {
      const plan = run(
        '{"a":{"description":"d","prompt":"p","tools":["Read"],"model":"sonnet","color":"red","experimental":{"x":1}}}',
      );
      expect(plan.refusals).toEqual([]);
      expect(plan.cliAgents).toEqual({
        a: { description: 'd', prompt: 'p', tools: ['Read'], model: 'sonnet' },
      });
    });

    test('a prompt may be empty', () => {
      expect(run('{"a":{"description":"d","prompt":""}}').refusals).toEqual([]);
    });

    test('with --print the value can be the path to a JSON file', () => {
      const plan = run('./agents.json', printFacts({ files: { './agents.json': file(REVIEWER) } }));
      expect(plan.cliAgents).toHaveProperty('reviewer');
    });

    test('in an interactive session a file path is refused', () => {
      expect(message('./agents.json', { files: { './agents.json': file(REVIEWER) } })).toBe(
        'Error: --agents takes a JSON object, or a file path only with --print (-p)',
      );
    });

    test('a file that does not exist is reported with its path', () => {
      expect(message('./gone.json', printFacts())).toBe(
        'Error: --agents file not found: ./gone.json',
      );
    });

    test('a value that begins with { but is not JSON prints one invalid JSON line with the parser message', () => {
      const lines = message('{"a": ').split('\n');
      expect(lines[0]).toBe('Error: Invalid --agents configuration:');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toStartWith('invalid JSON: ');
    });

    test('the contents of a file that do not parse print the same line', () => {
      const text = message('./a.json', printFacts({ files: { './a.json': file('not json') } }));
      expect(text).toContain('Error: Invalid --agents configuration:\ninvalid JSON: ');
    });

    test('a definition that does not match the schema prints one line per problem', () => {
      const lines = message('{"a":{"prompt":"p"},"b":{"description":"d"},"c":5}').split('\n');
      expect(lines[0]).toBe('Error: Invalid --agents configuration:');
      expect(lines.slice(1)).toEqual([
        'a.description: Required',
        'b.prompt: Required',
        'c: must be an object',
      ]);
    });

    test('a name that starts with - is refused', () => {
      expect(message('{"-x":{"description":"d","prompt":"p"}}')).toBe(
        "Error: Invalid --agents configuration:\n-x: agent names must not start with '-'",
      );
    });

    test('the checks run in order: with two kinds of problem the second shows only after the first is fixed', () => {
      const text = message('{"-x":{"prompt":"p"}}');
      expect(text).toContain('-x.description: Required');
      expect(text).not.toContain('must not start');
    });

    test('with more than 20 problem lines it prints the first 20 and …and N more', () => {
      const definitions = Array.from({ length: 23 }, (_, index) => `"a${index}":{"prompt":"p"}`);
      const lines = message(`{${definitions.join(',')}}`).split('\n');
      expect(lines).toHaveLength(1 + 20 + 1);
      expect(lines.at(-1)).toBe('…and 3 more');
    });

    test('--safe-mode ignores --agents entirely, even an invalid value', () => {
      const plan = planOf({ '--agents': '{bad', '--safe-mode': true });
      expect(plan.refusals).toEqual([]);
      expect(plan.cliAgents).toBeUndefined();
    });

    test('CLAUDE_CODE_SAFE_MODE=1 ignores --agents entirely, as --safe-mode does', () => {
      const on = run('{bad', { env: { CLAUDE_CODE_SAFE_MODE: '1' } });
      expect(on.refusals).toEqual([]);
      expect(on.cliAgents).toBeUndefined();
      expect(run('{bad', { env: { CLAUDE_CODE_SAFE_MODE: '0' } }).refusals).toHaveLength(1);
    });

    test('with --resume or --continue an inline value is not checked and the session starts', () => {
      for (const mode of [{ resume: true }, { continuing: true }]) {
        const plan = run('{bad', mode);
        expect(plan.refusals).toEqual([]);
        expect(plan.cliAgents).toBeUndefined();
        expect(run('{"a":{"prompt":"p"}}', mode).refusals).toEqual([]);
      }
    });

    test('with --resume or --continue a value read from a file is checked on every launch', () => {
      for (const mode of [{ resume: true }, { continuing: true }]) {
        const bad = run(
          './agents.json',
          printFacts({ ...mode, files: { './agents.json': file('{bad') } }),
        );
        expect(bad.refusals[0]).toContain('invalid JSON');
        const gone = run('./gone.json', printFacts(mode));
        expect(gone.refusals).toEqual(['Error: --agents file not found: ./gone.json']);
      }
    });
  });
});

describe('--append-subagent-system-prompt', () => {
  describe('native-runtime helper, outside the plugin-host contract', () => {
    test('with -p appends the text to every subagent system prompt', () => {
      const plan = planOf(
        { '--append-subagent-system-prompt': 'Cite file paths in every answer' },
        printFacts(),
      );
      expect(plan.subagentPromptAppend).toBe('Cite file paths in every answer');
    });

    test('only applies in non-interactive mode: an interactive session ignores it', () => {
      expect(
        planOf({ '--append-subagent-system-prompt': 'x' }).subagentPromptAppend,
      ).toBeUndefined();
    });

    test('cannot be combined with the file form: the run exits 1 with the documented message', () => {
      const plan = planOf(
        {
          '--append-subagent-system-prompt': 'x',
          '--append-subagent-system-prompt-file': './rules.txt',
        },
        printFacts({ files: { './rules.txt': file('y') } }),
      );
      expect(plan.refusals).toEqual([
        'Error: Cannot use both --append-subagent-system-prompt and --append-subagent-system-prompt-file. Please use only one.',
      ]);
      expect(plan.subagentPromptAppend).toBeUndefined();
    });
  });
});

describe('--append-subagent-system-prompt-file', () => {
  describe('native-runtime helper, outside the plugin-host contract', () => {
    test('with -p loads the text of the file and appends it to subagent system prompts', () => {
      const plan = planOf(
        { '--append-subagent-system-prompt-file': './subagent-rules.txt' },
        printFacts({ files: { './subagent-rules.txt': file('Be brief.\nCite paths.') } }),
      );
      expect(plan.subagentPromptAppend).toBe('Be brief.\nCite paths.');
    });

    test('only applies in non-interactive mode', () => {
      const plan = planOf(
        { '--append-subagent-system-prompt-file': './r.txt' },
        { files: { './r.txt': file('x') } },
      );
      expect(plan.subagentPromptAppend).toBeUndefined();
      expect(plan.refusals).toEqual([]);
    });

    test('the two flags cannot be combined, and the refusal is printed once', () => {
      const plan = planOf(
        {
          '--append-subagent-system-prompt-file': './r.txt',
          '--append-subagent-system-prompt': 'x',
        },
        printFacts({ files: { './r.txt': file('y') } }),
      );
      expect(plan.refusals).toHaveLength(1);
    });
  });

  test('a file that does not exist fails the run', () => {
    const plan = planOf({ '--append-subagent-system-prompt-file': './gone.txt' }, printFacts());
    expect(plan.refusals).toEqual([
      'Error: --append-subagent-system-prompt-file file not found: ./gone.txt',
    ]);
  });
});

describe('--forward-subagent-text', () => {
  describe('native-runtime helper, outside the plugin-host contract', () => {
    test('with --print and --output-format stream-json subagent text and thinking blocks are forwarded', () => {
      const plan = planOf(
        { '--forward-subagent-text': true },
        printFacts({ outputFormat: 'stream-json' }),
      );
      expect(plan.forwardSubagentText).toBe(true);
      expect(plan.warnings).toEqual([]);
    });

    test('requires --print: an interactive session forwards nothing', () => {
      const plan = planOf({ '--forward-subagent-text': true }, { outputFormat: 'stream-json' });
      expect(plan.forwardSubagentText).toBe(false);
    });

    test('requires --output-format stream-json: another format forwards nothing and says so', () => {
      const plan = planOf(
        { '--forward-subagent-text': true },
        printFacts({ outputFormat: 'json' }),
      );
      expect(plan.forwardSubagentText).toBe(false);
      expect(plan.warnings[0]?.message).toContain('stream-json');
    });

    test('CLAUDE_CODE_FORWARD_SUBAGENT_TEXT=1 enables the same behavior, with the same requirements', () => {
      const env = { CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1' };
      expect(planOf({}, printFacts({ outputFormat: 'stream-json', env })).forwardSubagentText).toBe(
        true,
      );
      expect(planOf({}, { outputFormat: 'stream-json', env }).forwardSubagentText).toBe(false);
      expect(planOf({}, printFacts({ outputFormat: 'json', env })).forwardSubagentText).toBe(false);
    });

    test('the variable is ignored outside non-interactive stream-json, where the flag would warn', () => {
      const env = { CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1' };
      expect(planOf({}, printFacts({ outputFormat: 'json', env })).warnings).toEqual([]);
      const off = { CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '0' };
      expect(
        planOf({}, printFacts({ outputFormat: 'stream-json', env: off })).forwardSubagentText,
      ).toBe(false);
    });

    test('without the flag subagent text stays out of the stream', () => {
      expect(planOf({}, printFacts({ outputFormat: 'stream-json' })).forwardSubagentText).toBe(
        false,
      );
    });
  });
});
