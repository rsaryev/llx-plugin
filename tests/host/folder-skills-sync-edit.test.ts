/**
 * The folders' skills that change under a running session (skills.md, "Remove a skill": "Skill
 * synced from claude.ai"; "Edit a skill during a session": "Live change detection covers `SKILL.md`
 * text only"). The kit reads `~/.claude/skills/synced/` as it finds it; downloading, removing and
 * watching are the host's, so these tests play the host: they change the disk and call
 * `reloadSkills` as its sync and watcher would.
 */
import { describe, expect, test } from 'bun:test';
import { signal } from '../support/host.ts';
import { HOME, folderHostOf, menuOf, skillText } from '../support/scan.ts';
import { spec } from '../support/spec.ts';

const synced = (name: string) => `${HOME}/.claude/skills/synced/${name}/SKILL.md`;
const hooks = (command: string): string =>
  JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command }] }] } });
const reload = (session: { reloadSkills(o: { signal: AbortSignal }): Promise<unknown> }) =>
  session.reloadSkills({ signal: signal() });

spec('skills.behavior.Remove a skill.Skill synced from claude.ai', () => {
  test('a skill turned off on claude.ai is removed from the synced folder, and the next read drops it', async () => {
    const files: Record<string, string> = {
      [synced('pdf')]: skillText('Pdf'),
      [synced('xlsx')]: skillText('Xlsx'),
    };
    const { session } = folderHostOf(files);
    await reload(session);
    expect(menuOf(session)).toEqual(['pdf', 'xlsx']);
    delete files[synced('xlsx')];
    await reload(session);
    expect(menuOf(session)).toEqual(['pdf']);
  });

  test('a directory deleted by hand is gone at the next read, and listed again once the host sync downloads it again', async () => {
    const files: Record<string, string> = { [synced('pdf')]: skillText('Pdf') };
    const { session } = folderHostOf(files);
    await reload(session);
    delete files[synced('pdf')];
    await reload(session);
    expect(menuOf(session)).toEqual([]);
    // The download is the host's (a service of claude.ai); the skill is still enabled there.
    files[synced('pdf')] = skillText('Pdf');
    await reload(session);
    expect(menuOf(session)).toEqual(['pdf']);
  });

  test('the file of a synced skill edited by hand is read as it is: nothing is uploaded, the next sync may overwrite it', async () => {
    const files: Record<string, string> = { [synced('pdf')]: skillText('Pdf') };
    const { session } = folderHostOf(files);
    await reload(session);
    files[synced('pdf')] = skillText('Pdf edited by hand');
    await reload(session);
    const expansion = await session.expandSkill('pdf', { signal: signal() });
    expect(expansion.ok && expansion.text).toContain('Pdf edited by hand');
  });
});

describe('live change detection covers SKILL.md text only', () => {
  const toolbox = `${HOME}/.claude/skills/toolbox`;
  const bash = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' };

  test('an edit of the SKILL.md of a skill folder that is also a plugin shows at the next read; an edit of hooks/ changes nothing', async () => {
    const files: Record<string, string> = {
      [`${toolbox}/SKILL.md`]: skillText('Toolbox'),
      [`${toolbox}/.claude-plugin/plugin.json`]: '{"name":"toolbox"}',
      [`${toolbox}/hooks/hooks.json`]: hooks('./first.sh'),
    };
    const { session, runner } = folderHostOf(files, { runs: [{}] });
    const first = await session.reloadSkills({ signal: signal() });
    expect(first.plugins.map((plugin) => plugin.id)).toEqual(['toolbox@skills-dir']);

    files[`${toolbox}/SKILL.md`] = skillText('Toolbox edited');
    files[`${toolbox}/hooks/hooks.json`] = hooks('./second.sh');
    const second = await session.reloadSkills({ signal: signal() });

    const expansion = await session.expandSkill('toolbox', { signal: signal() });
    expect(expansion.ok && expansion.text).toContain('Toolbox edited');
    expect(second.plugins).toEqual(first.plugins);
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toEqual([]);
  });

  test('the kit never watches: the folders to watch are a list the host reads, and a change reaches the session only through reloadSkills', async () => {
    const files: Record<string, string> = { [`${toolbox}/SKILL.md`]: skillText('Toolbox') };
    const { session } = folderHostOf(files);
    const read = await session.reloadSkills({ signal: signal() });
    expect(read.watch).toEqual([`${HOME}/.claude/skills`]);
    files[`${toolbox}/SKILL.md`] = skillText('Toolbox edited');
    const stale = await session.expandSkill('toolbox', { signal: signal() });
    expect(stale.ok && stale.text).toContain('Toolbox work');
    await session.reloadSkills({ signal: signal() });
    const fresh = await session.expandSkill('toolbox', { signal: signal() });
    expect(fresh.ok && fresh.text).toContain('Toolbox edited work');
  });
});
