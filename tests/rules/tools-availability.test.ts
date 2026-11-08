/**
 * permissions.md § Manage permissions ("A bare tool name like `Bash` removes the tool from Claude's
 * context entirely"), § Tool name wildcards; cli-reference.md § `--disallowedTools`; tools-reference.md
 * § EndConversation tool behavior and § Glob tool behavior. Which of the candidate tools Claude sees,
 * from the deny rules in force: a bare name or glob removes, a scoped rule does not, `EndConversation`
 * stays while any other tool remains.
 */
import { describe, expect, test } from 'bun:test';
import { availableTools, type ToolSession } from '../../src/rules/tools/availability.ts';
import { parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const session = (
  rules: readonly (readonly [string, 'deny' | 'allow'])[] = [],
  rest: Partial<ToolSession> = {},
): ToolSession => ({
  platform: 'windows',
  rules: rules.map(([text, behavior]) => parsed(text, behavior)),
  ...rest,
});

const denying = (...texts: string[]) => session(texts.map((text) => [text, 'deny'] as const));
const posix = (rest: Partial<ToolSession> = {}) => session([], { platform: 'posix', ...rest });

const CANDIDATES = [
  'Bash',
  'Read',
  'Edit',
  'EndConversation',
  'mcp__github__get_issue',
  'mcp__slack__post',
];

describe('permissions.md § Manage permissions: a bare tool name removes the tool', () => {
  test('"Edit" removes Edit and nothing else', () => {
    expect(availableTools(CANDIDATES, denying('Edit'))).toEqual(
      CANDIDATES.filter((tool) => tool !== 'Edit'),
    );
  });

  test('Bash(*) is the bare name: both forms remove the tool', () => {
    expect(availableTools(CANDIDATES, denying('Bash'))).not.toContain('Bash');
    expect(availableTools(CANDIDATES, denying('Bash(*)'))).not.toContain('Bash');
  });

  test('a scoped rule such as Bash(rm *) leaves the tool available', () => {
    expect(availableTools(CANDIDATES, denying('Bash(rm *)'))).toEqual(CANDIDATES);
  });

  test('a parameter rule, an ask rule and an allow rule remove nothing', () => {
    const rules: [string, 'deny' | 'allow'][] = [
      ['Agent(model:opus)', 'deny'],
      ['Read', 'allow'],
    ];
    expect(availableTools([...CANDIDATES, 'Agent'], session(rules))).toEqual([
      ...CANDIDATES,
      'Agent',
    ]);
    const asking = { ...session(), rules: [parsed('Edit', 'ask')] };
    expect(availableTools(CANDIDATES, asking)).toEqual(CANDIDATES);
  });
});

describe('cli-reference.md § --disallowedTools and permissions.md § Tool name wildcards', () => {
  test('"mcp__*" removes every MCP tool and no built-in one', () => {
    expect(availableTools(CANDIDATES, denying('mcp__*'))).toEqual([
      'Bash',
      'Read',
      'Edit',
      'EndConversation',
    ]);
  });

  test('an MCP server name removes the tools of that server', () => {
    expect(availableTools(CANDIDATES, denying('mcp__github'))).not.toContain(
      'mcp__github__get_issue',
    );
    expect(availableTools(CANDIDATES, denying('mcp__github'))).toContain('mcp__slack__post');
  });
});

spec('tools.tool.EndConversation', () => {
  describe('tools-reference.md § EndConversation tool behavior: no deny rule removes it while any other tool remains', () => {
    test('a deny rule naming EndConversation has no effect', () => {
      expect(availableTools(CANDIDATES, denying('EndConversation'))).toContain('EndConversation');
    });

    test('a glob that matches it, other than "*", has no effect while another tool remains', () => {
      expect(availableTools(CANDIDATES, denying('End*'))).toContain('EndConversation');
    });

    test('--tools "" removes it when no MCP tool remains, and keeps it while one does', () => {
      const none = session([], { toolsFlag: [] });
      expect(availableTools(CANDIDATES, none)).toEqual([
        'EndConversation',
        'mcp__github__get_issue',
        'mcp__slack__post',
      ]);
      const builtIn = ['Bash', 'Read', 'EndConversation'];
      expect(availableTools(builtIn, none)).toEqual([]);
      const mcpDenied = session([['mcp__*', 'deny']], { toolsFlag: [] });
      expect(availableTools(CANDIDATES, mcpDenied)).toEqual([]);
    });

    test('--tools "" keeps it when an allow rule names it', () => {
      const named = session([['EndConversation', 'allow']], { toolsFlag: [] });
      expect(availableTools(['Bash', 'EndConversation'], named)).toEqual(['EndConversation']);
    });

    test('a --tools list cannot remove it', () => {
      const kept = availableTools(CANDIDATES, session([], { toolsFlag: ['Read'] }));
      expect(kept).toContain('EndConversation');
      expect(kept).toContain('Read');
      expect(kept).not.toContain('Bash');
    });

    test('deny rules that remove every other tool without matching it leave it in place', () => {
      const rules = ['Bash', 'Read', 'Edit', 'mcp__*'];
      expect(availableTools(CANDIDATES, denying(...rules))).toEqual(['EndConversation']);
    });
  });

  describe('when the deny rules remove every other tool and also match it', () => {
    test('"*" removes it too rather than leaving it as the only tool', () => {
      expect(availableTools(CANDIDATES, denying('*'))).toEqual([]);
    });

    test('unless an allow rule names EndConversation explicitly', () => {
      const rules = [
        ['*', 'deny'],
        ['EndConversation', 'allow'],
      ] as const;
      expect(availableTools(CANDIDATES, session(rules))).toEqual(['EndConversation']);
    });

    test('an allow rule with a glob or for another tool does not save it', () => {
      expect(
        availableTools(
          CANDIDATES,
          session([
            ['*', 'deny'],
            ['Bash', 'allow'],
          ]),
        ),
      ).toEqual([]);
    });
  });

  test('it is the only candidate and nothing denies it: it stays', () => {
    expect(availableTools(['EndConversation'], session())).toEqual(['EndConversation']);
  });

  test('a candidate list without it never gains it', () => {
    expect(availableTools(['Bash'], session())).toEqual(['Bash']);
  });
});

spec(['tools.tool.Glob', 'tools.tool.Grep'], () => {
  describe('tools-reference.md § Glob tool behavior: absent by default on macOS, Linux and WSL', () => {
    const tools = ['Bash', 'Read', 'Glob', 'Grep'];

    test('on Windows both are in the default tool set', () => {
      expect(availableTools(tools, session())).toEqual(tools);
    });

    test('on posix both are left out', () => {
      expect(availableTools(tools, posix())).toEqual(['Bash', 'Read']);
    });

    test('--tools gives the ones it lists', () => {
      expect(availableTools(tools, posix({ toolsFlag: ['Bash', 'Grep'] }))).toEqual([
        'Bash',
        'Grep',
      ]);
    });

    test('naming either in --allowedTools restores both', () => {
      expect(availableTools(tools, posix({ allowedToolsFlag: ['Glob'] }))).toEqual(tools);
      expect(availableTools(tools, posix({ allowedToolsFlag: ['Grep(src/**)'] }))).toEqual(tools);
    });

    test('an allow rule in a settings file does not restore them', () => {
      const rules = [
        ['Glob', 'allow'],
        ['Grep', 'allow'],
      ] as const;
      expect(availableTools(tools, posix({ rules: rules.map(([t, b]) => parsed(t, b)) }))).toEqual([
        'Bash',
        'Read',
      ]);
    });

    test('a deny rule, --disallowedTools or --restricted removing Bash brings them back', () => {
      const denyBash = posix({ rules: [parsed('Bash', 'deny')] });
      expect(availableTools(tools, denyBash)).toEqual(['Read', 'Glob', 'Grep']);
      expect(availableTools(tools, posix({ restricted: true }))).toEqual(['Read', 'Glob', 'Grep']);
    });

    test('a scoped Bash deny rule does not remove Bash, so they stay out', () => {
      const scoped = posix({ rules: [parsed('Bash(rm *)', 'deny')] });
      expect(availableTools(tools, scoped)).toEqual(['Bash', 'Read']);
    });
  });
});

describe('judgment: --tools restricts built-in tools only', () => {
  test('an MCP tool is not on the --tools list and stays', () => {
    const kept = availableTools(CANDIDATES, session([], { toolsFlag: ['Read'] }));
    expect(kept).toContain('mcp__github__get_issue');
    expect(kept).toContain('mcp__slack__post');
  });
});
