/**
 * skills.md § Frontmatter reference: what the docs leave open about a value a field does not
 * take. The skill still loads (a YAML error loads "with no fields set"), so the kit drops the
 * value and warns; these are judgments (spec/judgments.md) and live outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { messages, readFields } from '../support/skill-read.ts';

describe('a value a field does not take (judgment: dropped with a warning, the skill loads)', () => {
  const cases: readonly (readonly [string, string, string])[] = [
    ['effort', 'extreme', 'effort is not one of: low, medium, high, xhigh, max'],
    ['context', 'inline', 'context is not one of: fork'],
    ['shell', 'zsh', 'shell is not one of: bash, powershell'],
    ['disable-model-invocation', 'maybe', 'disable-model-invocation is not a flag'],
    ['user-invocable', 'sometimes', 'user-invocable is not a flag'],
    ['background', '2', 'background is not a flag'],
  ];
  for (const [key, value, message] of cases) {
    test(`${key}: ${value}`, () => {
      const { skill, issues } = readFields(`${key}: ${value}\ndescription: kept`);
      expect(skill.description).toBe('kept');
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
      expect(messages(issues)[0]?.startsWith(message)).toBe(true);
    });
  }

  test('so the field takes its default', () => {
    const { skill } = readFields(
      'effort: extreme\ncontext: inline\nshell: zsh\ndisable-model-invocation: maybe\nuser-invocable: sometimes\nbackground: 2',
    );
    expect(skill).toMatchObject({
      disableModelInvocation: false,
      userInvocable: true,
      background: true,
      shell: 'bash',
    });
    expect(skill.effort).toBeUndefined();
    expect(skill.context).toBeUndefined();
  });

  test('effort is matched exactly: the docs list lowercase names', () => {
    expect(readFields('effort: High').skill.effort).toBeUndefined();
  });

  test('a list where text belongs is dropped with a warning', () => {
    const { skill, issues } = readFields('model: [a, b]\nagent:\n  - x');
    expect(skill.model).toBeUndefined();
    expect(skill.agent).toBeUndefined();
    expect(messages(issues)).toEqual(['model is not text', 'agent is not text']);
  });

  test('a list item that is not text is dropped with a warning', () => {
    const { skill, issues } = readFields('allowed-tools:\n  - Read\n  - 3\n  - [a]');
    expect(skill.allowedTools).toEqual(['Read']);
    expect(messages(issues)).toEqual(['allowed-tools has an item that is not text']);
  });
});
