import { describe, expect, test } from 'bun:test';
import { caseNames, kitExpansion, readExpected } from '../../scripts/oracle/model-content.ts';

/**
 * What the model reads when a plugin's skill or command is invoked: the kit's `expandSkill` text is
 * the block Claude Code sends after the `<command-message>` block (`bun run oracle:model-content`,
 * recorded in tests/fixtures/model-content/<case>/expected.json).
 */
const cases = await Promise.all(
  (await caseNames()).map(async (name) => ({ name, expected: await readExpected(name) })),
);

describe('the text a skill or command gives the model (oracle)', () => {
  for (const { name, expected } of cases) {
    test(`${name} (Claude Code ${expected.claudeCodeVersion})`, async () => {
      const index = expected.blocks.findIndex((block) => block.startsWith('<command-message>'));
      const kit = await kitExpansion(name);
      expect(kit.ok).toBe(true);
      expect(kit.text).toBe(expected.blocks[index + 1] ?? '');
    });
  }
});
