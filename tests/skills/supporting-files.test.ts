/**
 * skills.md § Add supporting files: a skill folder may hold more than `SKILL.md` (`reference.md`,
 * `examples.md`, `scripts/helper.py`); "Large reference docs ... don't need to load into context
 * every time the skill runs", so `SKILL.md` references them and "Claude [loads] them when needed",
 * and a utility script is "executed, not loaded".
 */
import { expect, test } from 'bun:test';
import { expandSkill } from '../../src/skills/expand.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { PROJECT, scanOf } from '../support/scan.ts';
import { spec } from '../support/spec.ts';

const SKILL_MD = `---
name: api-helper
description: Work with the API
---

Use the helper. Check: !\`\${CLAUDE_SKILL_DIR}/scripts/helper.py check\`

## Additional resources

- For complete API details, see [reference.md](reference.md)
- For usage examples, see [examples.md](examples.md)
`;

const FOLDER = `${PROJECT}/.claude/skills/api-helper`;
const FILES = {
  [`${FOLDER}/SKILL.md`]: SKILL_MD,
  [`${FOLDER}/reference.md`]: 'REFERENCE: a very long API reference',
  [`${FOLDER}/examples.md`]: 'EXAMPLES: many usage examples',
  [`${FOLDER}/scripts/helper.py`]: '#!/usr/bin/env python3\nprint("ok")',
};

/** Scans the folder and expands the one skill found, with a runner that records what it ran. */
async function expandFound() {
  const outcome = await scanOf(FILES);
  const entry = outcome.entries[0];
  const head = entry?.invocable;
  const body = await entry?.readBody();
  if (head === undefined || head.kind !== 'skill' || body === undefined) {
    throw new Error('expected a skill');
  }
  const skill = { ...head, body };
  const runner = scriptedRunner({ stdout: 'checked' });
  const expansion = await expandSkill(
    skill,
    {
      arguments: '',
      sessionId: 's',
      disableShellExecution: false,
      shells: { bash: true, powershell: false },
      context: { interactive: true, trigger: 'user' },
      signal: new AbortController().signal,
    },
    { runner, locations: locations(), environment: fakeEnvironment(), permissions: () => 'allow' },
  );
  return { skill, runner, expansion };
}

spec('skills.behavior.Add supporting files', () => {
  test('the folder is one skill: its supporting files are not skills and not part of its content', async () => {
    const outcome = await scanOf(FILES);
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['api-helper']);
    const [entry] = outcome.entries;
    const body = (await entry?.readBody()) ?? '';
    expect(body.includes('REFERENCE')).toBe(false);
    expect(body.includes('EXAMPLES')).toBe(false);
    expect(body.includes('print("ok")')).toBe(false);
  });

  test('what Claude receives names the files and where to find them, without loading them', async () => {
    const { expansion } = await expandFound();
    if (!expansion.ok) throw new Error(expansion.issues.map((found) => found.message).join('; '));
    expect(expansion.text.includes('[reference.md](reference.md)')).toBe(true);
    expect(expansion.text.includes('[examples.md](examples.md)')).toBe(true);
    expect(expansion.text.includes('REFERENCE')).toBe(false);
    expect(expansion.text.includes('print("ok")')).toBe(false);
  });

  test('a script is executed, not loaded: `${CLAUDE_SKILL_DIR}` points at the folder that holds it', async () => {
    const { skill, runner } = await expandFound();
    expect(skill.dir).toBe(FOLDER);
    expect(runner.calls[0]).toMatchObject({
      spec: { command: '${CLAUDE_SKILL_DIR}/scripts/helper.py check' },
      env: { CLAUDE_SKILL_DIR: FOLDER },
    });
  });
});
