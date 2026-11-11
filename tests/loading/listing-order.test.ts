/**
 * Judgment (spec/judgments.md, `src/format/listing.ts`): the kit sorts every folder listing itself,
 * by code unit, so a port that returns entries in another order (a Node `readdir` that does not sort,
 * a locale-aware sort) loads the same plugin and the same session listing.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/loading/index.ts';
import type { DirectoryEntry, PluginFiles } from '../../src/ports/index.ts';
import { hostOf, SESSION } from '../support/host.ts';
import { memoryFiles } from '../support/ports.ts';

const skill = (name: string) =>
  ['---', `description: ${name} ${'word '.repeat(40)}`, '---', 'Do it.'].join('\n');

const TREE = {
  '.claude-plugin/plugin.json': JSON.stringify({ name: 'p' }),
  ...Object.fromEntries(
    ['Mid', '_under', 'alpha', 'Zed', 'beta', 'ärger'].flatMap((name) => [
      [`skills/${name}/SKILL.md`, skill(name)],
      [`commands/${name}.md`, `---\ndescription: ${name}\n---\nRun.`],
      [
        `agents/${name}.md`,
        `---\nname: ${name.toLowerCase()}-agent\ndescription: ${name}\n---\nAct.`,
      ],
    ]),
  ),
};

/** The same files, listed in the order `order` gives. */
type Entries = readonly DirectoryEntry[];

const reordered = (order: (entries: Entries) => Entries): PluginFiles => {
  const files = memoryFiles(TREE);
  return {
    ...files,
    list: async (path, signal) => {
      const entries = await files.list(path, signal);
      return entries && order(entries);
    },
  };
};

const ORDERS = {
  reversed: (entries: Entries) => entries.toReversed(),
  locale: (entries: Entries) => entries.toSorted((a, b) => a.name.localeCompare(b.name)),
};

async function snapshotOf(files: PluginFiles) {
  const loaded = await loadPlugin({ files });
  if (loaded.plugin === undefined) throw new Error('the plugin did not load');
  const { host } = await hostOf({ plugins: [{ id: 'p@m', plugin: loaded.plugin }] });
  const session = host.openSession(SESSION);
  return { plugin: loaded.plugin, issues: loaded.issues, skills: session.skills() };
}

describe('judgments: the kit orders folder listings itself', () => {
  for (const [name, order] of Object.entries(ORDERS)) {
    test(`a port that lists ${name} loads the same plugin and the same skill listing`, async () => {
      const sorted = await snapshotOf(memoryFiles(TREE));
      expect(await snapshotOf(reordered(order))).toEqual(sorted);
    });
  }
});
