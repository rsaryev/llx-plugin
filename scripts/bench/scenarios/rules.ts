/**
 * `session.checkTool` (hooks, then `decide`) of Bash, Read and Edit calls against R permission rules
 * of each of the three kinds, none of which matches, first and again; and of a Bash command of W words against a fixed set. The
 * rules are compiled once per text (`rules/memo`), so the second check compiles nothing.
 */
import { parseRule, type PermissionRule } from '../../../src/rules/index.ts';
import type { DecideContext, PreparedCall } from '../../../src/index.ts';
import { bashCommand, permissionRules } from '../inputs.ts';
import { hostOver, SESSION, signal, type Bench, type Scenario } from './context.ts';

const SIZES = [4, 8, 16];
const WORDS = [8, 16, 32];
const FIXED_RULES = 4;

function rulesOf(salt: string, count: number): PermissionRule[] {
  return permissionRules(salt, count).map((text) => {
    const { rule } = parseRule(text, { behavior: 'deny', source: { kind: 'project' } });
    if (rule === undefined) throw new Error(`the rule ${text} does not parse`);
    return rule;
  });
}

const contextOf = (rules: readonly PermissionRule[]): Omit<DecideContext, 'hook'> => ({
  mode: 'default',
  rules,
  match: {
    paths: {
      cwd: '/work/app',
      home: '/home/user',
      primaryWorkingDirectory: '/work/app',
      additionalDirectories: [],
      platform: 'posix',
    },
  },
  autoAvailable: false,
  bypassAvailable: false,
  interactive: true,
});

async function checks(bench: Bench, call: PreparedCall, rules: readonly PermissionRule[]) {
  const session = hostOver(bench, []).openSession(SESSION);
  const permissionContext = contextOf(rules);
  const check = () =>
    session.checkTool(call, { toolUseId: 't1', permissionContext, signal: signal() });
  const first = await bench.tally.measure(check);
  const second = await bench.tally.measure(check);
  return { first, second };
}

const CALLS: Readonly<Record<string, (salt: string) => PreparedCall>> = {
  Bash: () => ({ toolName: 'Bash', input: { command: 'git status' } }),
  Read: () => ({ toolName: 'Read', input: { file_path: '/work/app/src/a.ts' } }),
  Edit: () => ({
    toolName: 'Edit',
    input: { file_path: '/work/app/src/a.ts', old_string: 'a', new_string: 'b' },
  }),
};

const byRules = (tool: string): Scenario => ({
  id: `checkTool.${tool}`,
  size: 'R rules of each kind',
  sizes: SIZES,
  laws: { first: 'linear', second: 'linear' },
  repeats: ['second'],
  run: (size, bench) =>
    checks(
      bench,
      CALLS[tool]?.(bench.salt) ?? { toolName: tool, input: {} },
      rulesOf(bench.salt, size),
    ),
});

export const RULES: readonly Scenario[] = [
  byRules('Bash'),
  byRules('Read'),
  byRules('Edit'),
  {
    id: 'checkTool.Bash.words',
    size: 'W words',
    sizes: WORDS,
    laws: { first: 'linear', second: 'linear' },
    repeats: ['second'],
    run: (size, bench) =>
      checks(
        bench,
        { toolName: 'Bash', input: { command: bashCommand(bench.salt, size) } },
        rulesOf(bench.salt, FIXED_RULES),
      ),
  },
];
