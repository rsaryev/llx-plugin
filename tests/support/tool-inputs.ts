/**
 * The `tool_input` tables of hooks.md ("PreToolUse input") copied by hand: one row per documented
 * field with the type, the example value and whether the table marks it optional. Tests read this,
 * never the kit's registry, so the registry is checked against the docs and not against itself.
 *
 * The docs mark a field optional in its description. Where the table says nothing (Agent's
 * `subagent_type`, ExitPlanMode's injected fields) the row follows the SDK's input type or the
 * page's own prose; spec/judgments.md says so.
 */
export type InputFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface InputRow {
  readonly tool: string;
  readonly field: string;
  readonly type: InputFieldType;
  readonly optional: boolean;
  readonly example: unknown;
}

const make =
  (optional: boolean) =>
  (tool: string, field: string, type: InputFieldType, example: unknown): InputRow => ({
    tool,
    field,
    type,
    optional,
    example,
  });
const req = make(false);
const opt = make(true);

const QUESTIONS = [
  {
    question: 'Which framework?',
    header: 'Framework',
    options: [
      { label: 'React', description: 'Component library' },
      { label: 'Vue', description: 'Progressive framework' },
    ],
    multiSelect: false,
  },
];

export const INPUT_TABLE: readonly InputRow[] = [
  req('Bash', 'command', 'string', 'npm test'),
  opt('Bash', 'description', 'string', 'Run test suite'),
  opt('Bash', 'timeout', 'number', 120000),
  opt('Bash', 'run_in_background', 'boolean', false),

  req('PowerShell', 'command', 'string', 'Get-ChildItem -Recurse'),
  opt('PowerShell', 'description', 'string', 'List files recursively'),
  opt('PowerShell', 'timeout', 'number', 120000),
  opt('PowerShell', 'run_in_background', 'boolean', false),

  req('Write', 'file_path', 'string', '/path/to/file.txt'),
  req('Write', 'content', 'string', 'file content'),

  req('Edit', 'file_path', 'string', '/path/to/file.txt'),
  req('Edit', 'old_string', 'string', 'original text'),
  req('Edit', 'new_string', 'string', 'replacement text'),
  opt('Edit', 'replace_all', 'boolean', false),

  req('Read', 'file_path', 'string', '/path/to/file.txt'),
  opt('Read', 'offset', 'number', 10),
  opt('Read', 'limit', 'number', 50),

  req('Glob', 'pattern', 'string', '**/*.ts'),
  opt('Glob', 'path', 'string', '/path/to/dir'),

  req('Grep', 'pattern', 'string', 'TODO.*fix'),
  opt('Grep', 'path', 'string', '/path/to/dir'),
  opt('Grep', 'glob', 'string', '*.ts'),
  opt('Grep', 'output_mode', 'string', 'content'),
  opt('Grep', '-i', 'boolean', true),
  opt('Grep', 'multiline', 'boolean', false),

  req('WebFetch', 'url', 'string', 'https://example.com/api'),
  req('WebFetch', 'prompt', 'string', 'Extract the API endpoints'),
  opt('WebFetch', 'offset', 'number', 100000),

  req('WebSearch', 'query', 'string', 'react hooks best practices'),
  opt('WebSearch', 'allowed_domains', 'array', ['docs.example.com']),
  opt('WebSearch', 'blocked_domains', 'array', ['spam.example.com']),
  opt('WebSearch', 'mode', 'string', 'extended'),

  req('Agent', 'prompt', 'string', 'Find all API endpoints'),
  req('Agent', 'description', 'string', 'Find API endpoints'),
  opt('Agent', 'subagent_type', 'string', 'Explore'),
  opt('Agent', 'model', 'string', 'sonnet'),

  req('AskUserQuestion', 'questions', 'array', QUESTIONS),
  opt('AskUserQuestion', 'answers', 'object', { 'Which framework?': 'React' }),

  opt('ExitPlanMode', 'plan', 'string', '## Refactor auth\n1. Extract...'),
  opt('ExitPlanMode', 'planFilePath', 'string', '/Users/me/plans/refactor-auth.md'),
  opt('ExitPlanMode', 'allowedPrompts', 'array', [{ tool: 'Bash', prompt: 'run tests' }]),
];

/** A value of another type than `type`, for the "wrong type is refused" case. */
export const WRONG_VALUE: { readonly [T in InputFieldType]: unknown } = {
  string: 42,
  number: 'ten',
  boolean: 'yes',
  array: 'not a list',
  object: ['not', 'an', 'object'],
};

/** The required fields of one tool filled with their example values: a valid call to add a field to. */
export function validInput(tool: string): Record<string, unknown> {
  return Object.fromEntries(
    INPUT_TABLE.filter((entry) => entry.tool === tool && !entry.optional).map((entry) => [
      entry.field,
      entry.example,
    ]),
  );
}
