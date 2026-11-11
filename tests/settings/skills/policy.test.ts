/** The four skill keys as one object over a view: the composition, not a requirement of its own. */
import { expect, test } from 'bun:test';
import { createSkillSettingsPolicy } from '../../../src/settings/skills/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { plain } from '../../support/settings-layers.ts';

const context = { hasManagedSettings: false, parentMerge: false, env: {} };

test('with no settings a skill is shown, bundled skills load, inline shell runs and sync is on', () => {
  const policy = createSkillSettingsPolicy(viewOf(), context);
  expect(policy.visibility('deploy').listedToModel).toBe('full');
  expect(policy.bundledSkillsDisabled).toBe(false);
  expect(plain(policy.shell('user'))).toEqual({ run: true });
  expect(policy.syncClaudeAiSkills().download).toBe(true);
});

test('every key is read through the one view', () => {
  const policy = createSkillSettingsPolicy(
    viewOf([
      'managed',
      {
        skillOverrides: { deploy: 'off' },
        disableBundledSkills: true,
        disableSkillShellExecution: true,
        syncClaudeAiSkills: false,
      },
    ]),
    context,
  );
  expect(policy.visibility('deploy').inSlashMenu).toBe(false);
  expect(policy.bundled().builtInCommandsListedToModel).toBe(false);
  expect(policy.bundledSkillsDisabled).toBe(true);
  expect(policy.shell('plugin').run).toBe(false);
  expect(policy.syncClaudeAiSkills().moveToTrash).toBe(true);
});

test('the environment the host passes reaches the bundled skills decision', () => {
  const policy = createSkillSettingsPolicy(viewOf(), {
    ...context,
    env: { CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: '1' },
  });
  expect(policy.bundledSkillsDisabled).toBe(true);
});
