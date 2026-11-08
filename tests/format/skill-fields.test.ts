/**
 * skills.md § Frontmatter reference (the table of fields and the paragraphs around it), read
 * through `readSkill`. Each block proves what the kit reads from one field. What a host does with
 * the value (forking a subagent, overriding the model, matching paths) is the runtime's and is
 * proven where that code is. How a bad value is reported is the kit's judgment (spec/judgments.md)
 * and is tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { FIELD_READERS, SKILL_FIELDS, readSkillFields } from '../../src/format/skill-fields.ts';
import { readFields } from '../support/skill-read.ts';
import { spec } from '../support/spec.ts';

const DOCUMENTED = [
  'name',
  'description',
  'when_to_use',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'disallowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'background',
  'hooks',
  'paths',
  'shell',
  'metadata',
  'license',
  'compatibility',
];

describe('the closed list of documented fields', () => {
  test('is the table of skills.md, in its order, with a reader for each', () => {
    expect(Array.from<string>(SKILL_FIELDS)).toEqual(DOCUMENTED);
    expect(Object.keys(FIELD_READERS)).toEqual(DOCUMENTED);
  });

  test('"Claude Code ignores a field it doesn\'t recognize without reporting an error"', () => {
    const { skill, issues } = readFields(
      'when-to-use: nope\nDescription: nope\nkeywords: a, b\nversion: 2\nhide-from-slash-command-tool: true',
    );
    expect(issues).toEqual([]);
    expect(skill.whenToUse).toBeUndefined();
    expect(skill.description).toBe('Do the work.');
    expect(skill.disableModelInvocation).toBe(false);
  });

  test('a key must match exactly: letter case and underscores for hyphens do not', () => {
    const { skill } = readFields(
      'Disable-Model-Invocation: true\nuser_invocable: false\nWHEN_TO_USE: x',
    );
    expect(skill.disableModelInvocation).toBe(false);
    expect(skill.userInvocable).toBe(true);
    expect(skill.whenToUse).toBeUndefined();
  });

  test('a key that is an Object.prototype name sets nothing', () => {
    expect(readSkillFields({ constructor: 'x', toString: 'y', __proto__: 'z' })).toEqual({
      values: {},
      problems: [],
    });
  });

  test('every field is optional: an empty block gives the defaults', () => {
    const { skill, issues } = readFields('');
    expect(issues).toEqual([]);
    expect(skill).toMatchObject({
      arguments: [],
      disableModelInvocation: false,
      userInvocable: true,
      allowedTools: [],
      disallowedTools: [],
      background: true,
      paths: [],
      shell: 'bash',
    });
    expect(skill.hooks).toBeUndefined();
    expect(skill.model).toBeUndefined();
  });
});

spec('skills.frontmatter.disable-model-invocation', () => {
  test('the docs example: `true` keeps Claude from invoking the skill on its own', () => {
    const { skill, issues } = readFields(
      'name: deploy\ndescription: Deploy the application to production\ndisable-model-invocation: true',
      'Deploy $ARGUMENTS to production:',
    );
    expect(skill.disableModelInvocation).toBe(true);
    expect(issues).toEqual([]);
  });

  test('"Default: `false`"', () => {
    expect(readFields('description: d').skill.disableModelInvocation).toBe(false);
  });

  test('a boolean field accepts yes, no, on, off, 1 and 0 in any letter case', () => {
    for (const yes of ['true', 'True', 'YES', 'On', '1']) {
      expect(readFields(`disable-model-invocation: ${yes}`).skill.disableModelInvocation).toBe(
        true,
      );
    }
    for (const no of ['false', 'FALSE', 'No', 'OFF', '0']) {
      expect(readFields(`disable-model-invocation: ${no}`).skill.disableModelInvocation).toBe(
        false,
      );
    }
  });
});

spec('skills.frontmatter.user-invocable', () => {
  test('"Default: `true`"', () => {
    expect(readFields('description: d').skill.userInvocable).toBe(true);
  });

  test('`false` marks the skill as for Claude only; the boolean spellings apply', () => {
    for (const no of ['false', 'no', 'Off', '0']) {
      expect(readFields(`user-invocable: ${no}`).skill.userInvocable).toBe(false);
    }
    for (const yes of ['true', 'YES', 'on', '1']) {
      expect(readFields(`user-invocable: ${yes}`).skill.userInvocable).toBe(true);
    }
  });

  test('it is independent of `disable-model-invocation`', () => {
    const { skill } = readFields('user-invocable: false\ndisable-model-invocation: true');
    expect(skill.userInvocable).toBe(false);
    expect(skill.disableModelInvocation).toBe(true);
  });
});

spec('skills.frontmatter.allowed-tools', () => {
  test('the docs example: space-separated rules, parenthesised specifiers stay whole', () => {
    const { skill } = readFields(
      'name: commit\nallowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)',
    );
    expect(skill.allowedTools).toEqual([
      'Bash(git add *)',
      'Bash(git commit *)',
      'Bash(git status *)',
    ]);
  });

  test('the table example: `Read Grep`', () => {
    expect(readFields('allowed-tools: Read Grep').skill.allowedTools).toEqual(['Read', 'Grep']);
  });

  test('"a space- or comma-separated string, or a YAML list"', () => {
    expect(readFields('allowed-tools: Read, Grep,Glob').skill.allowedTools).toEqual([
      'Read',
      'Grep',
      'Glob',
    ]);
    expect(readFields('allowed-tools:\n  - Read\n  - Bash(gh *)').skill.allowedTools).toEqual([
      'Read',
      'Bash(gh *)',
    ]);
  });

  test("a comma or space inside a rule's parentheses does not split it", () => {
    expect(
      readFields('allowed-tools: Bash(git log --format="%h, %s") Read').skill.allowedTools,
    ).toEqual(['Bash(git log --format="%h, %s")', 'Read']);
  });

  test('"substitutes ${CLAUDE_SKILL_DIR}": the reader keeps the variable as written', () => {
    const { skill } = readFields('allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)');
    expect(skill.allowedTools).toEqual(['Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)']);
  });

  test('absent means no grant', () => {
    expect(readFields('description: d').skill.allowedTools).toEqual([]);
  });
});

spec('skills.frontmatter.disallowed-tools', () => {
  test('"a space- or comma-separated string, or a YAML list" of tools to remove', () => {
    expect(readFields('disallowed-tools: AskUserQuestion Write').skill.disallowedTools).toEqual([
      'AskUserQuestion',
      'Write',
    ]);
    expect(readFields('disallowed-tools: AskUserQuestion, Edit').skill.disallowedTools).toEqual([
      'AskUserQuestion',
      'Edit',
    ]);
    expect(
      readFields('disallowed-tools:\n  - AskUserQuestion\n  - Bash(rm *)').skill.disallowedTools,
    ).toEqual(['AskUserQuestion', 'Bash(rm *)']);
  });

  test('is read apart from `allowed-tools`', () => {
    const { skill } = readFields('allowed-tools: Read\ndisallowed-tools: Write');
    expect(skill.allowedTools).toEqual(['Read']);
    expect(skill.disallowedTools).toEqual(['Write']);
    expect(readFields('description: d').skill.disallowedTools).toEqual([]);
  });
});

spec('skills.frontmatter.model', () => {
  test('keeps the value as written, `inherit` included', () => {
    expect(readFields('model: sonnet').skill.model).toBe('sonnet');
    expect(readFields('model: inherit').skill.model).toBe('inherit');
  });

  test('"the same values as /model": the set is the host\'s, so the kit does not validate it', () => {
    for (const value of ['opus', 'opusplan', 'sonnet[1m]', 'claude-opus-4-1-20250805']) {
      const { skill, issues } = readFields(`model: ${value}`);
      expect(skill.model).toBe(value);
      expect(issues).toEqual([]);
    }
  });

  test('absent means the session model', () => {
    expect(readFields('description: d').skill.model).toBeUndefined();
  });
});

spec('skills.frontmatter.effort', () => {
  test('"Options: low, medium, high, xhigh, max"', () => {
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      const { skill, issues } = readFields(`effort: ${level}`);
      expect(skill.effort).toBe(level);
      expect(issues).toEqual([]);
    }
  });

  test('absent leaves the level to the effort resolution order', () => {
    expect(readFields('description: d').skill.effort).toBeUndefined();
  });
});

spec('skills.frontmatter.context', () => {
  test('the docs examples: `context: fork` runs the skill in a forked subagent', () => {
    const { skill, issues } = readFields(
      'name: deploy\ndescription: Deploy the application to production\ncontext: fork\ndisable-model-invocation: true',
    );
    expect(skill.context).toBe('fork');
    expect(issues).toEqual([]);
  });

  test('absent runs the skill inline', () => {
    expect(readFields('description: d').skill.context).toBeUndefined();
  });
});

spec('skills.frontmatter.agent', () => {
  test('the docs example: `agent: Explore` names the subagent type of a forked skill', () => {
    const { skill } = readFields('name: deep-research\ncontext: fork\nagent: Explore');
    expect(skill.agent).toBe('Explore');
  });

  test('any subagent name is kept as written, a custom one from .claude/agents/ included', () => {
    expect(readFields('agent: general-purpose').skill.agent).toBe('general-purpose');
    expect(readFields('agent: code-reviewer').skill.agent).toBe('code-reviewer');
  });

  test('absent stays absent: the default type is chosen when the skill runs', () => {
    expect(readFields('context: fork').skill.agent).toBeUndefined();
  });
});

spec('skills.frontmatter.background', () => {
  test('"Default: `true`"', () => {
    expect(readFields('context: fork').skill.background).toBe(true);
  });

  test('`false` waits for the forked subagent; the boolean spellings apply', () => {
    for (const no of ['false', 'no', 'OFF', '0']) {
      expect(readFields(`context: fork\nbackground: ${no}`).skill.background).toBe(false);
    }
    expect(readFields('context: fork\nbackground: yes').skill.background).toBe(true);
  });
});

spec('skills.frontmatter.shell', () => {
  test('"Accepts `bash` (default) or `powershell`"', () => {
    expect(readFields('description: d').skill.shell).toBe('bash');
    expect(readFields('shell: bash').skill.shell).toBe('bash');
    expect(readFields('shell: powershell').skill.shell).toBe('powershell');
  });
});
