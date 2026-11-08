/**
 * skills.md § Frontmatter reference (hooks, paths, metadata, license, compatibility);
 * hooks.md § Hooks in skills and agents. Each block proves what the kit reads from the field.
 * Metadata, license and compatibility are accepted and kept, and nothing more is claimed:
 * "Claude Code accepts the field but doesn't act on it".
 */
import { describe, expect, test } from 'bun:test';
import { COMPATIBILITY_LIMIT } from '../../src/format/skill-field-readers.ts';
import { messages, readFields } from '../support/skill-read.ts';
import { spec } from '../support/spec.ts';

spec('skills.frontmatter.hooks', () => {
  test('the hooks.md example: a PreToolUse hook is carried in the official shape', () => {
    const { skill, issues } = readFields(
      [
        'name: secure-operations',
        'description: Perform operations with security checks',
        'hooks:',
        '  PreToolUse:',
        '    - matcher: "Bash"',
        '      hooks:',
        '        - type: command',
        '          command: "./scripts/security-check.sh"',
      ].join('\n'),
    );
    expect(issues).toEqual([]);
    expect(skill.hooks).toEqual({
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/security-check.sh' }] },
      ],
    });
  });

  test('"in the same configuration format as settings-based hooks": `once` is carried', () => {
    const { skill } = readFields(
      'hooks:\n  Stop:\n    - hooks:\n        - type: command\n          command: ./done.sh\n          once: true',
    );
    expect(skill.hooks).toEqual({
      Stop: [{ hooks: [{ type: 'command', command: './done.sh', once: true }] }],
    });
  });

  test('a skill without hooks has none', () => {
    expect(readFields('description: d').skill.hooks).toBeUndefined();
  });

  test('a name that is not a hook event is reported by the hooks reader', () => {
    const { issues } = readFields(
      'hooks:\n  BeforeEverything:\n    - hooks:\n        - type: command\n          command: ./x.sh',
    );
    expect(messages(issues)).toEqual([
      'hooks.BeforeEverything "BeforeEverything" is not a hook event',
    ]);
  });

  test('an unknown event is warned about and kept, as the hooks reader keeps it (judgment)', () => {
    const { skill, issues } = readFields(
      'hooks:\n  Stop:\n    - hooks:\n        - type: command\n          command: ./done.sh\n  Bogus:\n    - hooks:\n        - type: command\n          command: ./x.sh',
    );
    expect(messages(issues)).toEqual(['hooks.Bogus "Bogus" is not a hook event']);
    expect(Object.keys(skill.hooks ?? {})).toEqual(['Stop', 'Bogus']);
  });

  test('a handler the hooks reader refuses leaves the skill loaded and without hooks (judgment)', () => {
    const { skill, issues } = readFields(
      'description: kept\nhooks:\n  PreToolUse:\n    - matcher: Bash\n      hooks:\n        - type: command',
    );
    expect(skill.description).toBe('kept');
    expect(skill.hooks).toBeUndefined();
    expect(issues.every((found) => found.severity === 'warning')).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });

  test('hooks that are a list or a scalar are dropped with the shared "not a table" reason', () => {
    for (const value of ['[a, b]', 'always']) {
      const { skill, issues } = readFields(`hooks: ${value}`);
      expect(skill.hooks).toBeUndefined();
      expect(messages(issues)).toEqual(['hooks is a list or a single value, not a table']);
    }
  });
});

spec('skills.frontmatter.paths', () => {
  test('"Accepts a comma-separated string": each pattern is one item, trimmed', () => {
    expect(readFields('paths: src/**/*.ts, lib/**/*.ts').skill.paths).toEqual([
      'src/**/*.ts',
      'lib/**/*.ts',
    ]);
  });

  test('"or a YAML list", the form of the path-specific rules example', () => {
    expect(
      readFields('paths:\n  - "src/**/*.{ts,tsx}"\n  - "lib/**/*.ts"\n  - "tests/**/*.test.ts"')
        .skill.paths,
    ).toEqual(['src/**/*.{ts,tsx}', 'lib/**/*.ts', 'tests/**/*.test.ts']);
  });

  test('a brace group is one pattern, not split at its comma', () => {
    expect(readFields('paths: src/**/*.{ts,tsx}, lib/**/*.ts').skill.paths).toEqual([
      'src/**/*.{ts,tsx}',
      'lib/**/*.ts',
    ]);
  });

  test('a space is part of a pattern: only commas separate a string', () => {
    expect(readFields('paths: my dir/**, *.md').skill.paths).toEqual(['my dir/**', '*.md']);
  });

  test('an opener with no closer swallows the rest of the string: one item (judgment)', () => {
    expect(readFields('paths: a{b, c,d').skill.paths).toEqual(['a{b, c,d']);
    expect(readFields('allowed-tools: Bash(a b, Read').skill.allowedTools).toEqual([
      'Bash(a b, Read',
    ]);
  });

  test('`paths` counts a parenthesis as a group too: `foo(bar, baz)` is one pattern (judgment)', () => {
    expect(readFields('paths: foo(bar, baz), lib/**').skill.paths).toEqual([
      'foo(bar, baz)',
      'lib/**',
    ]);
  });

  test('absent means the skill is not limited to any path', () => {
    expect(readFields('description: d').skill.paths).toEqual([]);
  });
});

spec('skills.frontmatter.metadata', () => {
  test('"Free-form YAML map": a map is kept whole, nested values included', () => {
    const { skill, issues } = readFields(
      'metadata:\n  entitlement: pro\n  catalog:\n    id: 42\n    tags: [a, b]',
    );
    expect(skill.metadata).toEqual({ entitlement: 'pro', catalog: { id: 42, tags: ['a', 'b'] } });
    expect(issues).toEqual([]);
  });

  test('"drops a value that isn\'t a map": a list or a scalar is not kept', () => {
    for (const value of ['[a, b]', 'pro', '3', 'true']) {
      expect(readFields(`metadata: ${value}`).skill.metadata).toBeUndefined();
    }
  });

  test('"Don\'t reuse frontmatter field names such as `paths` as keys": they are kept, and set nothing', () => {
    const { skill } = readFields(
      'metadata:\n  paths: src/**\n  disable-model-invocation: true\n  allowed-tools: Bash(rm *)\n  hooks: {}',
    );
    expect(skill.metadata).toEqual({
      paths: 'src/**',
      'disable-model-invocation': true,
      'allowed-tools': 'Bash(rm *)',
      hooks: {},
    });
    expect(skill.paths).toEqual([]);
    expect(skill.disableModelInvocation).toBe(false);
    expect(skill.allowedTools).toEqual([]);
    expect(skill.hooks).toBeUndefined();
  });

  test('a dropped value is a warning that names the key (judgment)', () => {
    expect(messages(readFields('metadata: [a]').issues)).toEqual([
      'metadata is a list or a single value, not a table',
    ]);
  });
});

spec('skills.frontmatter.license', () => {
  test('is kept as text and acted on nowhere: the rest of the skill reads the same without it', () => {
    const base = 'name: pdf\ndescription: Work with PDF files\nallowed-tools: Read';
    const withLicense = readFields(`${base}\nlicense: Apache-2.0`).skill;
    const without = readFields(base).skill;
    expect(withLicense.license).toBe('Apache-2.0');
    expect(without.license).toBeUndefined();
    expect({ ...withLicense, license: undefined }).toEqual({ ...without, license: undefined });
  });

  test('a license text that is not text is dropped with a warning', () => {
    expect(messages(readFields('license: [MIT]').issues)).toEqual(['license is not text']);
  });
});

spec('skills.frontmatter.compatibility', () => {
  test('"Accepts a string of up to 500 characters": kept as written, no issue', () => {
    const text = 'Designed for Claude Code (or similar products)';
    const { skill, issues } = readFields(`compatibility: ${text}`);
    expect(skill.compatibility).toBe(text);
    expect(issues).toEqual([]);
    const full = 'x'.repeat(COMPATIBILITY_LIMIT);
    expect(readFields(`compatibility: ${full}`).issues).toEqual([]);
  });

  test('is accepted and not acted on: the rest of the skill reads the same without it', () => {
    const base = 'name: pdf\ndescription: Work with PDF files';
    const withIt = readFields(`${base}\ncompatibility: Needs git`).skill;
    const without = readFields(base).skill;
    expect({ ...withIt, compatibility: undefined }).toEqual({
      ...without,
      compatibility: undefined,
    });
  });

  test('characters are counted as Unicode characters, not UTF-16 units', () => {
    expect(readFields(`compatibility: ${'😀'.repeat(COMPATIBILITY_LIMIT)}`).issues).toEqual([]);
  });
});

describe('a compatibility over the 500 characters (judgment: kept, with a warning)', () => {
  test('501 characters is a warning and the text is still read', () => {
    const long = 'y'.repeat(COMPATIBILITY_LIMIT + 1);
    const { skill, issues } = readFields(`compatibility: ${long}`);
    expect(skill.compatibility).toBe(long);
    expect(issues.map((found) => found.severity)).toEqual(['warning']);
    expect(messages(issues)).toEqual(['compatibility has 501 characters; the limit is 500']);
  });
});
