/**
 * The scope folders (`FolderScan`) with K skills in `~/.claude/skills` and K commands in the project's
 * `.claude/commands` (skills.md, "Choose where skills load"): `reloadSkills` reads them, the listing
 * after it reads nothing, and expanding a folder skill reads its body, first and again.
 */
import { folderScan } from '../../../src/testing/index.ts';
import { hostOver, SESSION, signal, type Scenario } from './context.ts';

const at = (index: number): string => String(index).padStart(4, '0');

function scopeFolders(count: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let index = 0; index < count; index++) {
    files[`/home/user/.claude/skills/own-${at(index)}/SKILL.md`] =
      `---\ndescription: Own skill ${at(index)}\n---\nDo ${at(index)}.`;
    files[`/work/app/.claude/commands/task-${at(index)}.md`] =
      `---\ndescription: Task ${at(index)}\n---\nRun ${at(index)}.`;
  }
  return files;
}

export const FOLDERS: readonly Scenario[] = [
  {
    id: 'folders.skills',
    size: 'K skills and K commands',
    sizes: [4, 8, 16],
    laws: { reload: 'linear', skills: 'nothing', expand: 'constant', again: 'constant' },
    repeats: ['skills', 'again'],
    async run(size, bench) {
      const folders = folderScan(scopeFolders(size), { repositories: ['/work/app'] });
      const session = hostOver(bench, [], folders).openSession(SESSION);
      const reload = await bench.tally.measure(() => session.reloadSkills({ signal: signal() }));
      const skills = await bench.tally.measure(async () => session.skills());
      const run = () => session.expandSkill('own-0000', { arguments: 'x', signal: signal() });
      const expand = await bench.tally.measure(run);
      return { reload, skills, expand, again: await bench.tally.measure(run) };
    },
  },
];
