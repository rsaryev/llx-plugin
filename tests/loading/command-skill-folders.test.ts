/**
 * What Claude Code 2.1.319 makes of a `SKILL.md` in a commands location (E5a): the docs say custom
 * commands were merged into skills (skills.md, the note at the top) but not what a skill folder
 * inside `commands/` or a `commands` path is. Each folder here was run through `claude -p
 * --plugin-dir` and its `init` read (spec/judgments.md, "oracle 2.1.319"). Outside `spec(...)`: a
 * judgment is never compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { readCatalog } from '../../src/host/catalog.ts';
import { loadPlugin } from '../../src/index.ts';
import { json, namesOf } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';

const skill = (description = 'd', extra = '') =>
  `---\n${extra}description: ${description}\n---\nbody\n`;

async function load(tree: Record<string, string>) {
  const { plugin } = await loadPlugin({ files: memoryFiles(tree), fallbackName: 'plug' });
  if (plugin === undefined) throw new Error('the plugin does not load');
  return plugin;
}

const commandsOf = (tree: Record<string, string>) =>
  load(tree).then((plugin) => {
    const catalog = readCatalog(plugin);
    return {
      skills: catalog.skills.map((one) => one.command),
      commands: catalog.commands.map((one) => one.command),
    };
  });

describe('a folder holding SKILL.md in a commands location is a skill (oracle 2.1.319)', () => {
  test('named after its folder, beside the plain command files', async () => {
    const plugin = await load({ 'commands/alpha/SKILL.md': skill(), 'commands/plain.md': skill() });
    expect(namesOf(plugin.skills)).toEqual(['alpha']);
    expect(plugin.skills[0]?.directory).toBe('commands/alpha');
    expect(namesOf(plugin.commands)).toEqual(['plain']);
  });

  test('nothing else under the skill folder is a command or a skill', async () => {
    const plugin = await load({
      'commands/alpha/SKILL.md': skill(),
      'commands/alpha/notes.md': skill(),
      'commands/alpha/sub/inner.md': skill(),
      'commands/alpha/sub2/SKILL.md': skill(),
    });
    expect(namesOf(plugin.skills)).toEqual(['alpha']);
    expect(plugin.commands).toEqual([]);
  });

  test('a nested skill folder keeps its parent folders as segments', async () => {
    const plugin = await load({
      'commands/nest/deep/SKILL.md': skill(),
      'commands/nest/other.md': skill(),
    });
    expect(namesOf(plugin.skills)).toEqual(['nest:deep']);
    expect(namesOf(plugin.commands)).toEqual(['nest:other']);
  });

  test('a commands location that holds SKILL.md itself is one skill named after it', async () => {
    const declared = await load({
      '.claude-plugin/plugin.json': json({ name: 'plug', commands: './c' }),
      'c/SKILL.md': skill(),
      'c/side.md': skill(),
    });
    expect(namesOf(declared.skills)).toEqual(['c']);
    expect(declared.commands).toEqual([]);
    const standard = await load({ 'commands/SKILL.md': skill(), 'commands/x.md': skill() });
    expect(namesOf(standard.skills)).toEqual(['commands']);
    expect(standard.commands).toEqual([]);
  });

  test('a commands path to the SKILL.md file itself stays a command named SKILL', async () => {
    const plugin = await load({
      '.claude-plugin/plugin.json': json({ name: 'plug', commands: ['./x/gamma/SKILL.md'] }),
      'x/gamma/SKILL.md': skill(),
    });
    expect(plugin.skills).toEqual([]);
    expect(namesOf(plugin.commands)).toEqual(['SKILL']);
  });

  test('its frontmatter name does not rename it', async () => {
    const found = await commandsOf({ 'commands/alpha/SKILL.md': skill('d', 'name: zed\n') });
    expect(found.skills).toEqual(['plug:alpha']);
  });

  test('it wins over a skills/ folder of the same name, and a command file wins over it', async () => {
    const overSkills = await load({
      'skills/alpha/SKILL.md': skill('from-skills'),
      'commands/alpha/SKILL.md': skill('from-commands'),
    });
    expect(readCatalog(overSkills).skills.map((one) => one.description)).toEqual(['from-commands']);
    const underFile = await commandsOf({
      'commands/alpha.md': skill('from-file'),
      'commands/alpha/SKILL.md': skill('from-skill-folder'),
    });
    expect(underFile.commands).toEqual(['plug:alpha']);
  });

  test('a commands path naming ./skills/ loads each skill folder once', async () => {
    const plugin = await load({
      '.claude-plugin/plugin.json': json({ name: 'plug', commands: './skills/' }),
      'skills/alpha/SKILL.md': skill(),
      'skills/beta/SKILL.md': skill(),
    });
    expect(namesOf(plugin.skills).toSorted()).toEqual(['alpha', 'beta']);
    expect(namesOf(plugin.commands)).toEqual([]);
  });
});

describe('a skill named by itself gets a command name of [A-Za-z0-9_-] (oracle 2.1.319)', () => {
  // `claude plugin details` prints the name as written; the session's command drops the plugin's
  // own prefix and has each other UTF-16 unit as a hyphen, after the frontmatter name is trimmed.
  test.each([
    ['Plan Review', 'plug:Plan-Review'],
    ['  Lead Trail  ', 'plug:Lead-Trail'],
    ['dots.and_under', 'plug:dots-and_under'],
    ['x: y', 'plug:x--y'],
    ['a😀b', 'plug:a--b'],
    ['ok_name-1', 'plug:ok_name-1'],
    ['plug:Plan Review', 'plug:Plan-Review'],
    ['other:x', 'plug:other-x'],
  ])('the root SKILL.md named %p is %p', async (name, command) => {
    const plugin = await load({ 'SKILL.md': skill('d', `name: "${name}"\n`) });
    expect(readCatalog(plugin).skills.map((one) => one.command)).toEqual([command]);
  });

  test('the loaded skill keeps the name as written', async () => {
    const plugin = await load({ 'SKILL.md': skill('d', 'name: Plan Review\n') });
    expect(namesOf(plugin.skills)).toEqual(['Plan Review']);
  });

  test('a listed folder, and its folder-name fallback, are named the same way', async () => {
    const found = await commandsOf({
      '.claude-plugin/plugin.json': json({ name: 'plug', skills: ['./s/one two', './s/three'] }),
      's/one two/SKILL.md': skill(),
      's/three/SKILL.md': skill('d', 'name: Plan Review\n'),
    });
    expect(found.skills).toEqual(['plug:one-two', 'plug:Plan-Review']);
  });

  test('a skill found among a folder keeps a space in its folder name', async () => {
    const found = await commandsOf({ 'commands/my cmd/SKILL.md': skill() });
    expect(found.skills).toEqual(['plug:my cmd']);
  });
});
