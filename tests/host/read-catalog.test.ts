/**
 * docs/API.md § Host and sessions: `readCatalog(plugin)` is the reading of a loaded plugin's skills,
 * commands, agents and output styles that the host's sessions use, exported so a host that hands the
 * components to its own runtime reads them the same way and copies no mapping. The reading is the
 * format readers' (proven in their own tests); that the host gets it whole, cached per `Plugin`
 * object, is a judgment (spec/judgments.md), so every test here is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readCatalog } from '../../src/index.ts';
import { loaded } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

describe('readCatalog', () => {
  test("reads a nested command, an agent and an output style with their paths below the plugin's folders", async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': json({ name: 'tools' }),
      'commands/db/migrate.md': '---\ndescription: Migrate\n---\nRun it',
      'agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews\n---\nReview.',
      'output-styles/terse.md': '---\nname: Terse\ndescription: Short\n---\nBe short.',
    });
    const catalog = readCatalog(plugin);
    expect(catalog.commands.map((command) => [command.command, command.path])).toEqual([
      ['tools:db:migrate', 'commands/db/migrate.md'],
    ]);
    expect(catalog.agents.map((agent) => agent.scopedName)).toEqual(['tools:reviewer']);
    expect(catalog.outputStyles).toHaveLength(1);
    expect(readCatalog(plugin)).toBe(catalog);
  });
});
