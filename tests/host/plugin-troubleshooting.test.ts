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
import { locations, memoryFiles } from '../support/ports.ts';
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

/** The "not found" message the loader gives for a manifest key that names a path with nothing there. */
async function messageOf(component: string, path: string): Promise<string | undefined> {
  const { issues } = await loadPlugin({
    files: memoryFiles({ '.claude-plugin/plugin.json': manifest({ [component]: path }) }),
  });
  return issues.map((issue) => issue.message).find((text) => text.includes('not found'));
}

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

    describe('with many skills installed (skills.md, "Skill descriptions are cut short")', () => {
      const many = Object.fromEntries(
        Array.from({ length: 40 }, (_unused, index) => [
          `skills/s${index}/SKILL.md`,
          skill(`description: ${'Review pull requests for style and coverage. '.repeat(4)}`),
        ]),
      );
      const used = new Map([
        ['my-plugin:s3', 9],
        ['my-plugin:s17', 5],
      ]);

      test('the fallback budget of 8,000 characters holds all 40 descriptions: none is dropped', async () => {
        const listing = (await sessionOf(many)).skills().model;
        expect(listing.descriptionsDropped).toEqual([]);
        expect(listing.chars).toBeLessThan(8000);
      });

      test('a budget below the listing drops descriptions, keeps every name in order, and the most used keep theirs', async () => {
        const session = await sessionOf(many);
        const full = session.skills().model;
        const listing = session.skills({ budget: { chars: 3000 }, usage: used }).model;
        expect(listing.descriptionsDropped.length).toBeGreaterThan(0);
        expect(listing.chars).toBeLessThanOrEqual(3000);
        expect(listing.entries.map((entry) => entry.name)).toEqual(
          full.entries.map((entry) => entry.name),
        );
        const kept = listing.entries.filter((entry) => entry.description !== undefined);
        const keptNames = kept.map((entry) => entry.name);
        expect(keptNames).toContain('my-plugin:s3');
        expect(keptNames).toContain('my-plugin:s17');
        const dropped = new Set(listing.descriptionsDropped);
        expect(dropped.has('my-plugin:s3') || dropped.has('my-plugin:s17')).toBe(false);
        expect(kept.length + dropped.size).toBe(40);
      });

      test('skillListingMaxDescChars caps each entry whatever the budget', async () => {
        const session = await sessionOf(many);
        const roomy = session.skills().model;
        const tight = session.skills({ maxDescChars: 20 }).model;
        expect(roomy.entries[0]?.description?.length).toBeGreaterThan(100);
        expect(tight.entries[0]?.description?.length ?? 0).toBeLessThanOrEqual(20);
        expect(tight.descriptionsDropped).toEqual([]);
      });
    });
  });

  describe('a manifest path with nothing there', () => {
    const written = {
      commands: './missing',
      skills: './missing',
      agents: './missing.md',
      hooks: './missing.json',
    };
    spec('manifest.troubleshooting.commands path not found: <path>', () => {
      test('is "<component> path not found: <path>" for commands, skills, agents and hooks; the host puts its plugin root before the path', async () => {
        const paths = locations();
        const root = paths.pluginRoot('my-plugin@acme');
        for (const [component, path] of Object.entries(written)) {
          const message = await messageOf(component, path);
          const prefix = `${component} path not found: `;
          expect(message?.startsWith(prefix)).toBe(true);
          const shown = message?.slice(prefix.length) ?? '';
          expect(shown.endsWith(path)).toBe(true);
          const absolute = paths.joinPath(root, shown);
          expect(absolute.startsWith(root)).toBe(true);
          expect(absolute.endsWith(path.slice(2))).toBe(true);
        }
      });
    });

    test('the loader names the path as the manifest wrote it, where troubleshooting.md shows the absolute path (spec/judgments.md)', async () => {
      for (const [component, path] of Object.entries(written)) {
        expect(await messageOf(component, path)).toBe(`${component} path not found: ${path}`);
      }
    });
  });

  spec('manifest.troubleshooting.commands path not found: <path>', () => {
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
