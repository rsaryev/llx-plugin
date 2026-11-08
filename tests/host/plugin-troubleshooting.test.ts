/**
 * The skills and commands of a plugin as a session lists them (plugins/components.md, "Skills",
 * "Commands", "Define commands in the manifest"; skills.md, "How a skill gets its command name",
 * "Characters a skill name can't hold"; plugins/troubleshooting.md, "Plugin loads but its skills are
 * missing", "Skill loads but Claude never invokes the skill", "commands path not found"): the real
 * loader, the format readers and a host over the fakes.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/loading/index.ts';
import { validatePlugin } from '../../src/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const json = (value: unknown): string => JSON.stringify(value);
const manifest = (extra: object = {}) => json({ name: 'my-plugin', ...extra });
const skill = (...lines: readonly string[]): string =>
  ['---', ...lines, '---', 'Do the work.'].join('\n');

async function sessionOf(tree: Record<string, string>) {
  const plugin = await loaded({ '.claude-plugin/plugin.json': manifest(), ...tree });
  const { host } = await hostOf({ plugins: [{ id: 'my-plugin@acme', plugin }] });
  return host.openSession(SESSION);
}

const menu = (session: Awaited<ReturnType<typeof sessionOf>>) =>
  session
    .skills()
    .menu.map((entry) => entry.name)
    .toSorted();

describe('troubleshooting a plugin whose skills do not show', () => {
  spec('manifest.troubleshooting.Plugin loads but its skills are missing', () => {
    test('a skills/ directory inside .claude-plugin/ is not scanned; skills load from the plugin root', async () => {
      const session = await sessionOf({
        '.claude-plugin/skills/hidden/SKILL.md': skill('description: Hidden'),
        'skills/shown/SKILL.md': skill('description: Shown'),
      });
      expect(menu(session)).toEqual(['my-plugin:shown']);
    });

    test('a skills entry that points at a SKILL.md file rather than its directory is reported', async () => {
      const files = memoryFiles({
        '.claude-plugin/plugin.json': manifest({ skills: './skills/x/SKILL.md' }),
        'skills/x/SKILL.md': skill('description: X'),
      });
      const report = await validatePlugin({ files });
      const found = report.issues.find((issue) => issue.path === 'skills[0]');
      expect(found?.severity).toBe('error');
      expect(found?.message.toLowerCase()).toContain(
        'path is a file; skills entries must be directories containing skill.md',
      );
      const { issues } = await loadPlugin({ files });
      expect(issues.map((issue) => issue.severity)).toEqual(['error']);
    });
  });

  spec('manifest.troubleshooting.Skill loads but Claude never invokes the skill', () => {
    const files = {
      'skills/quiet/SKILL.md': skill('description: Quiet', 'disable-model-invocation: true'),
      'skills/loud/SKILL.md': skill('description: Loud'),
    };

    test('disable-model-invocation: true: the user runs /<plugin>:<skill>, Claude never sees it', async () => {
      const session = await sessionOf(files);
      expect(session.skills().model.entries.map((entry) => entry.name)).toEqual(['my-plugin:loud']);
      expect((await session.expandSkill('my-plugin:quiet', { signal: signal() })).ok).toBe(true);
      const refused = await session.expandSkill('my-plugin:quiet', {
        invoker: 'model',
        signal: signal(),
      });
      expect(refused.ok).toBe(false);
    });

    test('with many skills installed the listing shortens descriptions to fit its character budget', async () => {
      const many = Object.fromEntries(
        Array.from({ length: 40 }, (_unused, index) => [
          `skills/s${index}/SKILL.md`,
          skill(`description: ${'Review pull requests for style and coverage. '.repeat(4)}`),
        ]),
      );
      const session = await sessionOf(many);
      const roomy = session.skills().model;
      const tight = session.skills({ maxDescChars: 20 }).model;
      expect(roomy.entries[0]?.description?.length).toBeGreaterThan(100);
      expect(tight.entries[0]?.description?.length ?? 0).toBeLessThanOrEqual(20);
    });
  });

  spec('manifest.troubleshooting.commands path not found: <path>', () => {
    test('a manifest path with nothing there is "<component> path not found: <path>", for commands, skills, agents and hooks', async () => {
      const written = {
        commands: './missing',
        skills: './missing',
        agents: './missing.md',
        hooks: './missing.json',
      };
      for (const [component, path] of Object.entries(written)) {
        const { issues } = await loadPlugin({
          files: memoryFiles({ '.claude-plugin/plugin.json': manifest({ [component]: path }) }),
        });
        expect(issues.map((issue) => issue.message)).toContain(
          `${component} path not found: ${path}`,
        );
      }
    });

    test('a path that resolves outside the plugin root is "path escapes plugin directory" instead, and is dropped', async () => {
      const { issues, plugin } = await loadPlugin({
        files: memoryFiles({
          '.claude-plugin/plugin.json': manifest({ commands: './shared' }),
          shared: { symlink: '../elsewhere' },
        }),
      });
      expect(issues.map((issue) => issue.message)).toEqual([
        'commands path escapes plugin directory: ./shared — it resolves to ../elsewhere, outside the plugin directory',
      ]);
      expect(plugin?.commands ?? []).toEqual([]);
    });
  });
});
