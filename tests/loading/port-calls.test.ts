/**
 * Judgment (spec/judgments.md, `src/format/load-files.ts`): within one `loadPlugin` or
 * `validatePlugin` the host's port is asked for the `stat` or `exists` of a path once, however many
 * checks ask about it; a new load asks again.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin, validatePlugin } from '../../src/loading/index.ts';
import { memoryFiles } from '../support/ports.ts';

const TREE = {
  '.claude-plugin/plugin.json': JSON.stringify({ name: 'p' }),
  'skills/a/SKILL.md': '---\ndescription: a\n---\nDo a.',
  'skills/b/SKILL.md': '---\ndescription: b\n---\nDo b.',
  'commands/c.md': 'Run c.',
  'agents/d.md': '---\nname: d\ndescription: d\n---\nBe d.',
};

const repeatedMetadata = (accesses: readonly { operation: string; path: string }[]) => {
  const seen = new Map<string, number>();
  for (const { operation, path } of accesses) {
    if (operation !== 'stat' && operation !== 'exists') continue;
    const key = `${operation} ${path}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([key]) => key);
};

describe('judgments: one load asks for the metadata of a path once', () => {
  test('loadPlugin and validatePlugin repeat no stat or exists of a path', async () => {
    const loaded = memoryFiles(TREE);
    const { plugin } = await loadPlugin({ files: loaded });
    expect(plugin?.skills.map(({ name }) => name)).toEqual(['a', 'b']);
    expect(repeatedMetadata(loaded.accesses)).toEqual([]);
    const validated = memoryFiles(TREE);
    await validatePlugin({ files: validated });
    expect(repeatedMetadata(validated.accesses)).toEqual([]);
  });

  test('a second load asks the host again', async () => {
    const files = memoryFiles(TREE);
    await loadPlugin({ files });
    const first = files.accesses.length;
    await loadPlugin({ files });
    expect(files.accesses.length).toBe(2 * first);
  });
});
