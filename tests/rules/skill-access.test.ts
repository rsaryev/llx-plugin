/**
 * skills.md § Restrict Claude's skill access: `Skill(name)` and `Skill(name *)`, "The table shows
 * what a `deny` rule blocks beyond the name you write, by the kind of name in the rule" (an alias,
 * an unqualified name, a skill synced from claude.ai, the plugin form of a synced skill, the
 * parameter form), and "Claude Code matches an `allow` rule only against the skill's own name and
 * the name in Claude's invocation" with the three namespace examples. Each row is proven through
 * the names the kit computes for a real skill (`skillNamesOf`) and the real rule matcher.
 * permissions.md § Match by input parameter is the source of `Skill(skill:<name>)`.
 */
import { describe, expect, test } from 'bun:test';
import type { Skill } from '../../src/format/skill-types.ts';
import { matchRule, parseRule } from '../../src/rules/index.ts';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import type { PreparedCall } from '../../src/rules/index.ts';
import { skillNamesOf } from '../../src/skills/skill-rule.ts';
import { matchContext, parsed } from '../support/rule-context.ts';
import { PLUGIN, skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const ACCESS_0 = "skills.behavior.Restrict Claude's skill access.An alias";
const ACCESS_1 = "skills.behavior.Restrict Claude's skill access.An unqualified name";
const ACCESS_2 = "skills.behavior.Restrict Claude's skill access.A skill synced from claude.ai";
const ACCESS_3 = "skills.behavior.Restrict Claude's skill access.The plugin form of a synced skill";
const ACCESS_4 = "skills.behavior.Restrict Claude's skill access.A skill in the parameter form";
const ACCESS_5 = "skills.behavior.Restrict Claude's skill access.Skill(anthropic-skills:pdf)";
const ACCESS_6 = "skills.behavior.Restrict Claude's skill access.Skill(anthropic-skills *)";
const ACCESS_7 = "skills.behavior.Restrict Claude's skill access.Skill(anthropic *)";
const SYNCED = { kind: 'synced' } as const;

/** The call Claude makes for `skill`, called by `invoked`, with the names the kit lists for it. */
const callFor = (skill: Skill, invoked: string, aliases: readonly string[] = []): PreparedCall => ({
  toolName: 'Skill',
  input: { skill: invoked },
  skillNames: skillNamesOf(skill, aliases),
});

const blocks = (rule: string, call: PreparedCall): boolean =>
  matchRule(parsed(rule, 'deny'), call, matchContext);

const allows = (rule: string, invoked: string): boolean =>
  matchRule(parsed(rule, 'allow'), { toolName: 'Skill', input: { skill: invoked } }, matchContext);

const named = (name: string, frontmatter = `name: ${name}\ndescription: D`) =>
  skillWith(frontmatter, { name });

const nested = (name: string, directory: string): Skill => ({
  ...named(name),
  command: `${directory}:${name}`,
});

const CODE_REVIEW = named('code-review');
const DEPLOY = named('deploy');
const SYNCED_DEPLOY = skillWith('name: deploy\ndescription: D', { name: 'deploy', origin: SYNCED });

spec(ACCESS_0, () => {
  test('Skill(review) also blocks the bundled /code-review, through its /review alias', () => {
    const call = callFor(CODE_REVIEW, 'code-review', ['review']);
    expect(blocks('Skill(review)', call)).toBe(true);
    expect(blocks('Skill(code-review)', call)).toBe(true);
  });

  test('the alias blocks nothing else, and the rule needs the alias to be a name of the skill', () => {
    expect(blocks('Skill(review)', callFor(CODE_REVIEW, 'code-review'))).toBe(false);
    expect(blocks('Skill(review)', callFor(DEPLOY, 'deploy', ['ship']))).toBe(false);
  });

  test('only a deny rule sees the alias: an allow rule is matched against the invoked name', () => {
    const call = callFor(CODE_REVIEW, 'code-review', ['review']);
    expect(matchRule(parsed('Skill(review)', 'allow'), call, matchContext)).toBe(false);
    expect(allows('Skill(review)', 'review')).toBe(true);
  });
});

spec(ACCESS_1, () => {
  test('Skill(deploy) also blocks a nested skill listed as apps/web:deploy', () => {
    const call = callFor(nested('deploy', 'apps/web'), 'apps/web:deploy');
    expect(blocks('Skill(deploy)', call)).toBe(true);
    expect(blocks('Skill(apps/web:deploy)', call)).toBe(true);
  });

  test('another nested skill is not blocked by the name of the first', () => {
    expect(blocks('Skill(deploy)', callFor(nested('lint', 'apps/web'), 'apps/web:lint'))).toBe(
      false,
    );
  });

  test('an allow rule for the unqualified name does not approve the nested skill', () => {
    expect(allows('Skill(deploy)', 'apps/web:deploy')).toBe(false);
    expect(allows('Skill(deploy)', 'deploy')).toBe(true);
  });

  test('judgment: a plugin skill keeps its plugin as its namespace, so Skill(deploy) does not reach it', () => {
    const plugin = skillWith('name: deploy\ndescription: D', { name: 'deploy', origin: PLUGIN });
    expect(skillNamesOf(plugin)).toEqual(['my-plugin:deploy']);
    expect(blocks('Skill(deploy)', callFor(plugin, 'my-plugin:deploy'))).toBe(false);
  });
});

spec(ACCESS_2, () => {
  test('Skill(anthropic-skills:deploy) blocks the synced skill', () => {
    const call = callFor(SYNCED_DEPLOY, 'deploy');
    expect(blocks('Skill(anthropic-skills:deploy)', call)).toBe(true);
  });

  test('and the same skill when Claude Desktop delivers it to a session as a plugin', () => {
    const asPlugin = skillWith('name: deploy\ndescription: D', {
      name: 'deploy',
      origin: { kind: 'plugin', plugin: 'anthropic-skills' },
    });
    expect(asPlugin.command).toBe('anthropic-skills:deploy');
    expect(blocks('Skill(anthropic-skills:deploy)', callFor(asPlugin, asPlugin.command))).toBe(
      true,
    );
  });

  test('it does not block another synced skill, nor a local skill of the same short name', () => {
    expect(blocks('Skill(anthropic-skills:deploy)', callFor(named('pdf'), 'pdf'))).toBe(false);
    expect(blocks('Skill(anthropic-skills:deploy)', callFor(DEPLOY, 'deploy'))).toBe(false);
  });
});

spec(ACCESS_3, () => {
  test('Skill(deploy:deploy) blocks the synced skill, whatever name Claude called it by', () => {
    for (const invoked of ['deploy', 'anthropic-skills:deploy']) {
      expect([invoked, blocks('Skill(deploy:deploy)', callFor(SYNCED_DEPLOY, invoked))]).toEqual([
        invoked,
        true,
      ]);
    }
  });

  test('the plugin form is a plain name, not a parameter rule on a field called deploy', () => {
    const { rule, issues } = parseRule('Skill(deploy:deploy)', {
      behavior: 'deny',
      source: { kind: 'user' },
    });
    expect(issues).toEqual([]);
    expect(rule?.specifier).toEqual({ form: 'text', pattern: 'deploy:deploy' });
  });

  test('a local skill is not blocked by it', () => {
    expect(blocks('Skill(deploy:deploy)', callFor(DEPLOY, 'deploy'))).toBe(false);
  });
});

spec(ACCESS_4, () => {
  test('Skill(skill:deploy) blocks the skill whichever of its names Claude calls it by, alias and display name included', () => {
    const shipped = callFor(DEPLOY, 'ship', ['ship']);
    expect(blocks('Skill(skill:deploy)', shipped)).toBe(true);
    expect(blocks('Skill(skill:deploy)', callFor(DEPLOY, 'deploy', ['ship']))).toBe(true);
    expect(blocks('Skill(skill:ship)', callFor(DEPLOY, 'deploy', ['ship']))).toBe(true);
  });

  test('it blocks the nested skill by its unqualified name and the synced one by its short name', () => {
    expect(blocks('Skill(skill:deploy)', callFor(nested('deploy', 'a'), 'a:deploy'))).toBe(true);
    expect(blocks('Skill(skill:deploy)', callFor(SYNCED_DEPLOY, 'anthropic-skills:deploy'))).toBe(
      true,
    );
  });

  test('another skill is untouched', () => {
    expect(blocks('Skill(skill:deploy)', callFor(named('lint'), 'lint'))).toBe(false);
  });
});

spec(ACCESS_5, () => {
  test('"approves the synced pdf skill" and only that one', () => {
    expect(allows('Skill(anthropic-skills:pdf)', 'anthropic-skills:pdf')).toBe(true);
    expect(allows('Skill(anthropic-skills:pdf)', 'anthropic-skills:docx')).toBe(false);
    expect(allows('Skill(anthropic-skills:pdf)', 'pdf')).toBe(false);
  });
});

spec(ACCESS_6, () => {
  test('"approves every synced skill": every name inside the namespace', () => {
    for (const name of ['anthropic-skills:pdf', 'anthropic-skills:xlsx', 'anthropic-skills']) {
      expect([name, allows('Skill(anthropic-skills *)', name)]).toEqual([name, true]);
    }
  });

  test('a skill outside the namespace is not approved', () => {
    expect(allows('Skill(anthropic-skills *)', 'pdf')).toBe(false);
    expect(allows('Skill(anthropic-skills *)', 'anthropic-skillset:x')).toBe(false);
  });
});

spec(ACCESS_7, () => {
  test('"doesn\'t cover anthropic-skills:pdf, because a prefix outside the namespace doesn\'t match the names inside it"', () => {
    expect(allows('Skill(anthropic *)', 'anthropic-skills:pdf')).toBe(false);
    expect(allows('Skill(anthropic *)', 'anthropic-skills')).toBe(false);
  });

  test('it still approves the skill named anthropic and the names inside its own namespace', () => {
    expect(allows('Skill(anthropic *)', 'anthropic')).toBe(true);
    expect(allows('Skill(anthropic *)', 'anthropic:pdf')).toBe(true);
  });
});

describe('the names of a skill (judgments: spec/judgments.md)', () => {
  test('the command comes first and each name appears once', () => {
    const names = skillNamesOf(SYNCED_DEPLOY, ['deploy', 'ship']);
    expect(names[0]).toBe(SYNCED_DEPLOY.command);
    expect(names).toEqual(['anthropic-skills:deploy', 'deploy', 'deploy:deploy', 'ship']);
  });

  test('a skill with a plain name has just that name, a command file too', () => {
    expect(skillNamesOf(DEPLOY)).toEqual(['deploy']);
  });

  test('allow, ask and deny read the same host list but only deny uses its other names', () => {
    const call = callFor(nested('deploy', 'apps/web'), 'apps/web:deploy');
    const behaviours: PermissionBehavior[] = ['allow', 'ask', 'deny'];
    const result = behaviours.map((behavior) =>
      matchRule(parsed('Skill(deploy)', behavior), call, matchContext),
    );
    expect(result).toEqual([false, false, true]);
  });
});
