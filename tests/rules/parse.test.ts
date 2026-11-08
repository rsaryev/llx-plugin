/**
 * permissions.md § Permission rule syntax ("Tool or Tool(specifier). Parentheses inside the
 * specifier are literal") and § Match all uses of a tool (the Bash, WebFetch and Read rows, and
 * "`Bash(*)` is equivalent to `Bash`"); errors.md § Malformed Tool(content) rule (the quoted
 * message). The three requirement ids of this file are the three rows of the "Match all uses of a
 * tool" table: a bare tool name covers every use of that tool, whatever the input.
 *
 * Matching of what follows the tool name (command, path and domain patterns) has its own ids in the
 * sub-packages that implement it; here only the grammar and the bare form are proven.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { PERMISSION_BEHAVIORS } from '../../src/protocol/permission-modes.ts';
import { formatRule, matchRule, parseRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

/** Every behaviour covers every use of a tool when the rule is its bare name. */
function coversEveryUse(toolName: string, inputs: readonly unknown[], others: readonly string[]) {
  test('is a rule with no specifier, in the official { toolName } shape', () => {
    for (const behavior of PERMISSION_BEHAVIORS) {
      const rule = parsed(toolName, behavior);
      expect(rule.specifier).toBeUndefined();
      expect(rule.toolGlob).toBe(false);
      expect(rule.value).toEqual({ toolName });
    }
  });

  test('matches every call of the tool, whatever its input', () => {
    for (const behavior of PERMISSION_BEHAVIORS) {
      const rule = parsed(toolName, behavior);
      for (const input of inputs) {
        expect(matchRule(rule, call(toolName, input), matchContext)).toBe(true);
      }
    }
  });

  test('matches no other tool', () => {
    const rule = parsed(toolName);
    for (const other of others) {
      expect(matchRule(rule, call(other, inputs[0]), matchContext)).toBe(false);
    }
  });
}

spec('permissions.rule.Bash', () => {
  const commands = [
    { command: 'ls' },
    { command: 'npm run build && npm test' },
    { command: 'rm -rf /tmp/x | tee log; echo $(whoami)' },
    { command: 'git push origin main', run_in_background: true },
    {},
  ];
  coversEveryUse('Bash', commands, ['PowerShell', 'Read', 'Bashful']);

  test('Bash(*) is equivalent to Bash and matches all Bash commands', () => {
    for (const behavior of PERMISSION_BEHAVIORS) {
      const star = parsed('Bash(*)', behavior);
      const bare = parsed('Bash', behavior);
      expect(star.specifier).toBeUndefined();
      expect(star.value).toEqual(bare.value);
      for (const input of commands) {
        expect(matchRule(star, call('Bash', input), matchContext)).toBe(true);
      }
    }
  });

  test('as a deny rule both forms are whole-tool rules, so the tool leaves Claude context', () => {
    // The removal itself is the availability filter's (tools.tool.Bash); the rule shape it reads
    // is "deny, no specifier, no glob".
    for (const text of ['Bash', 'Bash(*)']) {
      const rule = parsed(text, 'deny');
      expect([rule.behavior, rule.specifier, rule.toolGlob]).toEqual(['deny', undefined, false]);
    }
  });
});

spec('permissions.rule.Read', () => {
  coversEveryUse(
    'Read',
    [
      { file_path: '/work/app/src/index.ts' },
      { file_path: '/etc/passwd', offset: 10, limit: 5 },
      {},
    ],
    ['Edit', 'Grep', 'Reader'],
  );
});

spec('permissions.rule.WebFetch', () => {
  coversEveryUse(
    'WebFetch',
    [
      { url: 'https://example.com/a', prompt: 'summarise' },
      { url: 'http://localhost:3000' },
      { url: 'https://api.a.b.example.com' },
    ],
    ['WebSearch', 'Bash'],
  );
});

describe('rule grammar: Tool or Tool(specifier)', () => {
  test('the text inside the parentheses is the official ruleContent', () => {
    expect(parsed('Bash(npm run build)').value).toEqual({
      toolName: 'Bash',
      ruleContent: 'npm run build',
    });
    expect(parsed('Read(./.env)').value).toEqual({ toolName: 'Read', ruleContent: './.env' });
  });

  test('parentheses inside the specifier are literal and need no escaping', () => {
    expect(parsed('Edit(./Finance (2024)/**)').value.ruleContent).toBe('./Finance (2024)/**');
    expect(parsed('Bash(echo (hi))').value.ruleContent).toBe('echo (hi)');
    expect(parsed('Bash(echo ((a))').value.ruleContent).toBe('echo ((a)');
  });

  test('a command, path or skill pattern is a text specifier', () => {
    expect(parsed('Bash(npm run *)').specifier).toEqual({ form: 'text', pattern: 'npm run *' });
    expect(parsed('Edit(src/**)').specifier).toEqual({ form: 'text', pattern: 'src/**' });
    expect(parsed('Agent(Explore)', 'deny').specifier).toEqual({
      form: 'text',
      pattern: 'Explore',
    });
  });

  test('WebFetch(domain:...) is a domain specifier whose pattern follows the prefix', () => {
    expect(parsed('WebFetch(domain:example.com)').specifier).toEqual({
      form: 'domain',
      pattern: 'example.com',
    });
    expect(parsed('WebFetch(domain:*.example.com)', 'allow').specifier).toEqual({
      form: 'domain',
      pattern: '*.example.com',
    });
  });

  test('the rule keeps its behaviour and the settings source it came from', () => {
    const source = { kind: 'flag-settings', file: '/tmp/s.json' } as const;
    const rule = parsed('Bash', 'ask', source);
    expect([rule.behavior, rule.source]).toEqual(['ask', source]);
  });

  test('surrounding whitespace in the settings entry is not part of the rule', () => {
    expect(parsed('  Bash(ls)  ').value).toEqual({ toolName: 'Bash', ruleContent: 'ls' });
    expect(parsed(' Read ').value).toEqual({ toolName: 'Read' });
  });

  test('empty parentheses read as the bare tool name', () => {
    expect(parsed('Bash()').specifier).toBeUndefined();
    expect(formatRule(parsed('Bash()').value)).toBe('Bash');
  });
});

describe('malformed rules (errors.md § Malformed Tool(content) rule)', () => {
  const MALFORMED =
    'Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal';

  test('text after the closing parenthesis is skipped with the documented message, verbatim', () => {
    const { rule, issues } = parseRule('Bash(ls) x', {
      behavior: 'allow',
      source: { kind: 'project' },
    });
    expect(rule).toBeUndefined();
    expect(issues).toEqual([
      {
        severity: 'error',
        path: 'permissions.allow',
        message: `Invalid permission rule "Bash(ls) x" was skipped: ${MALFORMED}`,
      },
    ]);
  });

  test('a missing parenthesis, an empty rule and a missing tool name are malformed too', () => {
    for (const text of ['Bash(ls', 'Bash)', 'Bash)(x)', '', '   ', '(ls)', '()']) {
      const { rule, issues } = parseRule(text, { behavior: 'deny', source: { kind: 'user' } });
      expect([text, rule]).toEqual([text, undefined]);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain(MALFORMED);
    }
  });
});

describe('parseRule edge cases (spec/judgments.md)', () => {
  test('an mcp__ rule with parentheses is skipped (permissions.md, "Match by input parameter")', () => {
    const { rule, issues } = parseRule('mcp__github__get_issue(id:7)', {
      behavior: 'deny',
      source: { kind: 'project' },
    });
    expect(rule).toBeUndefined();
    expect(issues.map((found) => found.severity)).toEqual(['error']);
    expect(issues[0]?.message).toContain('mcp__github__get_issue(id:7)');
  });

  test('a tool-name glob takes no specifier', () => {
    const { rule, issues } = parseRule('Ba*(ls)', { behavior: 'deny', source: { kind: 'user' } });
    expect(rule).toBeUndefined();
    expect(issues).toHaveLength(1);
  });

  test('a tool-name that holds * is a glob; one that does not is not', () => {
    expect(parsed('mcp__*').toolGlob).toBe(true);
    expect(parsed('*').toolGlob).toBe(true);
    expect(parsed('Bash').toolGlob).toBe(false);
  });

  test('a skipped rule never throws, whatever the text', () => {
    for (const text of ['(', ')', '((', '))', 'a(b', '\n', 'Bash(\n)', '\0']) {
      for (const behavior of PERMISSION_BEHAVIORS) {
        expect(() => parseRule(text, { behavior, source: { kind: 'cli' } })).not.toThrow();
      }
    }
  });
});

describe('formatRule', () => {
  const behaviors: readonly PermissionBehavior[] = ['deny', 'ask'];

  test('writes the tool name, with the specifier in parentheses when there is one', () => {
    expect(formatRule({ toolName: 'Bash' })).toBe('Bash');
    expect(formatRule({ toolName: 'Bash', ruleContent: 'npm run *' })).toBe('Bash(npm run *)');
    expect(formatRule({ toolName: 'Edit', ruleContent: './Finance (2024)/**' })).toBe(
      'Edit(./Finance (2024)/**)',
    );
  });

  test('round-trips parseRule', () => {
    const texts = [
      'Bash',
      'Bash(npm run build)',
      'Read(./.env)',
      'Edit(./Finance (2024)/**)',
      'WebFetch(domain:*.example.com)',
      'Agent(model:opus)',
      'Agent(isolation : worktree)',
      'mcp__puppeteer__*',
      'Agent(Explore)',
    ];
    for (const behavior of behaviors) {
      for (const text of texts) {
        const first = parsed(text, behavior);
        const again = parsed(formatRule(first.value), behavior);
        expect([text, again.value, again.specifier]).toEqual([text, first.value, first.specifier]);
      }
    }
  });

  test('Bash(*) formats as the equivalent bare Bash', () => {
    expect(formatRule(parsed('Bash(*)').value)).toBe('Bash');
  });
});
