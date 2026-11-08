/**
 * plugins/manifest-reference.md § How each key combines with its default location ("Replaces the
 * default: `commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`,
 * `experimental.monitors`. When you set `commands`, the default `commands/` directory isn't scanned. To
 * keep the default and add more, list it explicitly"; "Adds to the default: `skills`"; "Merges:
 * `hooks`, `mcpServers`, `lspServers`. The default file loads first"; the warning `Default <folder>/
 * folder is ignored because the manifest sets "<key>"` and how to avoid it), § Fields (the same rule per
 * key), § Containment and existence (`<component> path not found: <path>`, `<component> path escapes
 * plugin directory: <path>`); plugins/loading.md § Paths that escape the plugin directory (a symlink that
 * leads outside); errors.md § Path escapes plugin directory (the symlink message).
 */
import { describe, expect, test } from 'bun:test';
import { COMBINE, discoverComponents } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { messagesOf, namesOf, pathsOf, manifestOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const discover = (
  tree: Record<string, string | { symlink: string }>,
  manifest: Record<string, unknown>,
) =>
  discoverComponents(
    memoryFiles(tree),
    manifestOf({ name: 'my-plugin', ...manifest }),
    'my-plugin',
  );

const warning = (folder: string, key: string) =>
  `Default ${folder}/ folder is ignored because the manifest sets "${key}"`;

spec(
  [
    'manifest.field.commands',
    'manifest.rule.How each key combines with its default location.Replaces the default',
  ],
  () => {
    const tree = { 'commands/deploy.md': 'D.', 'extras/more.md': 'M.' };

    test('setting commands replaces the default: commands/ is not scanned and the warning says so', async () => {
      const found = await discover(tree, { commands: ['./extras/'] });
      expect(pathsOf(found.commands)).toEqual(['extras/more.md']);
      expect(messagesOf(found.issues)).toEqual([warning('commands', 'commands')]);
    });

    test('listing the default explicitly keeps it and adds more, with no warning', async () => {
      const found = await discover(tree, { commands: ['./commands/', './extras/'] });
      expect(pathsOf(found.commands)).toEqual(['commands/deploy.md', 'extras/more.md']);
      expect(found.issues).toEqual([]);
    });

    test('a path inside the default folder names a file in it and produces no warning', async () => {
      const found = await discover(tree, { commands: ['./commands/deploy.md'] });
      expect(pathsOf(found.commands)).toEqual(['commands/deploy.md']);
      expect(found.issues).toEqual([]);
    });

    test('the object map replaces the default too: a source file and inline content, named under the plugin', async () => {
      const found = await discover(
        { 'commands/deploy.md': 'D.', 'docs/status.md': 'S.' },
        {
          commands: {
            status: { source: './docs/status.md', argumentHint: '[env]' },
            about: { content: 'Explain what this plugin provides.' },
          },
        },
      );
      expect(found.commands.map((one) => [one.name, one.path])).toEqual([
        ['status', 'docs/status.md'],
        ['about', undefined],
      ]);
      expect(messagesOf(found.issues)).toEqual([warning('commands', 'commands')]);
    });

    test('a command map source that is missing is "commands path not found"', async () => {
      const found = await discover({}, { commands: { gone: { source: './docs/gone.md' } } });
      expect(messagesOf(found.issues)).toEqual(['commands path not found: ./docs/gone.md']);
      expect(found.commands).toEqual([]);
    });
  },
);

spec('manifest.field.agents', () => {
  test('setting agents replaces the agents/ scan', async () => {
    const found = await discover(
      { 'agents/reviewer.md': 'R.', 'custom/tester.md': 'T.' },
      { agents: ['./custom/tester.md'] },
    );
    expect(namesOf(found.agents)).toEqual(['tester']);
    expect(messagesOf(found.issues)).toEqual([warning('agents', 'agents')]);
  });
});

spec('manifest.field.outputStyles', () => {
  test('setting outputStyles replaces the output-styles/ scan; a directory or a file both work', async () => {
    const tree = { 'output-styles/terse.md': 'T.', 'styles/loud.md': 'L.', 'more/quiet.md': 'Q.' };
    const found = await discover(tree, { outputStyles: ['./styles/', './more/quiet.md'] });
    expect(namesOf(found.outputStyles)).toEqual(['loud', 'quiet']);
    expect(messagesOf(found.issues)).toEqual([warning('output-styles', 'outputStyles')]);
  });
});

spec('manifest.field.workflows', () => {
  test('setting workflows replaces the workflows/ scan', async () => {
    const found = await discover(
      { 'workflows/a.js': '1', 'flows/b.js': '2' },
      { workflows: './flows' },
    );
    expect(pathsOf(found.workflows)).toEqual(['flows/b.js']);
    expect(messagesOf(found.issues)).toEqual([warning('workflows', 'workflows')]);
  });
});

spec('manifest.field.experimental.themes', () => {
  test('experimental.themes replaces the themes/ scan and the warning names that key', async () => {
    const found = await discover(
      { 'themes/a.json': '{}', 'looks/b.json': '{}' },
      { experimental: { themes: './looks/' } },
    );
    expect(pathsOf(found.themes)).toEqual(['looks/b.json']);
    expect(messagesOf(found.issues)).toEqual([warning('themes', 'experimental.themes')]);
  });

  test('a top-level themes key still loads, and the warning names the key that was set', async () => {
    const found = await discover(
      { 'themes/a.json': '{}', 'looks/b.json': '{}' },
      { themes: './looks' },
    );
    expect(pathsOf(found.themes)).toEqual(['looks/b.json']);
    expect(messagesOf(found.issues)).toEqual([warning('themes', 'themes')]);
  });
});

spec('manifest.field.experimental.monitors', () => {
  test('experimental.monitors replaces monitors/monitors.json: the default file is not a source', async () => {
    const found = await discover(
      { 'monitors/monitors.json': '[]', 'extra/watch.json': '[]' },
      { experimental: { monitors: './extra/watch.json' } },
    );
    expect(found.monitors).toEqual([{ file: 'extra/watch.json', written: './extra/watch.json' }]);
    expect(messagesOf(found.issues)).toEqual([warning('monitors', 'experimental.monitors')]);
  });

  test('the inline array is one source and replaces the default file too', async () => {
    const inline = [{ name: 'deploy-status', command: 'poll', description: 'Deploys' }];
    const found = await discover(
      { 'monitors/monitors.json': '[]' },
      { experimental: { monitors: inline } },
    );
    expect(found.monitors).toEqual([{ inline }]);
  });
});

spec(
  [
    'manifest.field.skills',
    'manifest.rule.How each key combines with its default location.Adds to the default',
  ],
  () => {
    test('skills adds to the default: skills/ is still scanned and the listed directories load alongside it', async () => {
      const found = await discover(
        { 'skills/review/SKILL.md': 'R.', 'extra-skills/lint/SKILL.md': 'L.' },
        { skills: ['./extra-skills/'] },
      );
      expect(pathsOf(found.skills)).toEqual([
        'skills/review/SKILL.md',
        'extra-skills/lint/SKILL.md',
      ]);
      expect(found.issues).toEqual([]);
    });

    test('a listed directory that is itself a skill (SKILL.md directly in it) is one skill; "." names the plugin root', async () => {
      const one = await discover({ 'tools/fmt/SKILL.md': 'F.' }, { skills: './tools/fmt' });
      expect(pathsOf(one.skills)).toEqual(['tools/fmt/SKILL.md']);
      expect(namesOf(one.skills)).toEqual(['fmt']);
      const root = await discover(
        { 'SKILL.md': 'Root.', 'skills/a/SKILL.md': 'A.' },
        { skills: ['.'] },
      );
      expect(pathsOf(root.skills)).toEqual(['skills/a/SKILL.md', 'SKILL.md']);
    });

    test('listing skills/ again loads it once', async () => {
      const found = await discover(
        { 'skills/a/SKILL.md': 'A.' },
        { skills: ['./skills/', './skills'] },
      );
      expect(pathsOf(found.skills)).toEqual(['skills/a/SKILL.md']);
    });
  },
);

spec(
  ['manifest.field.hooks', 'manifest.rule.How each key combines with its default location.Merges'],
  () => {
    test('the default hooks file loads first, then what the manifest declares, in the order declared', async () => {
      const found = await discover(
        { 'hooks/hooks.json': '{}', 'config/extra-hooks.json': '{}' },
        { hooks: ['./config/extra-hooks.json', { PostToolUse: [] }] },
      );
      expect(found.hooks).toEqual([
        { file: 'hooks/hooks.json', written: 'hooks/hooks.json' },
        { file: 'config/extra-hooks.json', written: './config/extra-hooks.json' },
        { inline: { PostToolUse: [] } },
      ]);
    });
  },
);

spec('manifest.field.lspServers', () => {
  test('.lsp.json loads first, then each declared config in order', async () => {
    const found = await discover(
      { '.lsp.json': '{}', 'lsp/more.json': '{}' },
      {
        lspServers: [
          './lsp/more.json',
          { go: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } },
        ],
      },
    );
    expect(found.lspServers.map((one) => ('file' in one ? one.file : 'inline'))).toEqual([
      '.lsp.json',
      'lsp/more.json',
      'inline',
    ]);
  });
});

describe('combine rules and path checks', () => {
  test('replace uses the declared list when the key is set, even an empty one, else the default', () => {
    expect(COMBINE.replace(['commands'], ['x'])).toEqual(['x']);
    expect(COMBINE.replace(['commands'], [])).toEqual([]);
    expect(COMBINE.replace(['commands'], undefined)).toEqual(['commands']);
  });

  test('add keeps the default first and drops a repeat; merge keeps every entry in order', () => {
    expect(COMBINE.add(['skills'], ['a', 'skills'])).toEqual(['skills', 'a']);
    expect(COMBINE.merge(['d'], ['a', 'd'])).toEqual(['d', 'a', 'd']);
  });

  test('a declared path that does not exist is "<component> path not found: <path>"; a missing default is skipped silently', async () => {
    const found = await discover(
      {},
      { commands: ['./nope.md'], hooks: './nope/hooks.json', agents: ['./a.md'] },
    );
    expect(messagesOf(found.issues).toSorted()).toEqual([
      'agents path not found: ./a.md',
      'commands path not found: ./nope.md',
      'hooks path not found: ./nope/hooks.json',
    ]);
    expect((await discover({}, {})).issues).toEqual([]);
  });

  test('a path that is a symlink leading outside the plugin does not load and the message says where it goes', async () => {
    const found = await discover(
      { 'commands/deploy.md': { symlink: '../shared/deploy.md' }, 'commands/ok.md': 'Ok.' },
      { commands: ['./commands/deploy.md'] },
    );
    expect(found.commands).toEqual([]);
    expect(messagesOf(found.issues)).toEqual([
      'commands path escapes plugin directory: ./commands/deploy.md — it resolves to ../shared/deploy.md, outside the plugin directory',
    ]);
  });

  test('a default file that is a symlink outside the plugin is skipped with the component named', async () => {
    const found = await discover({ 'hooks/hooks.json': { symlink: '/etc/hooks.json' } }, {});
    expect(found.hooks).toEqual([]);
    expect(messagesOf(found.issues)).toEqual([
      'hooks path escapes plugin directory: hooks/hooks.json — it resolves to /etc/hooks.json, outside the plugin directory',
    ]);
  });

  test('experimental.monitors wins over a top-level monitors key when both are set (judgment)', async () => {
    const inline = [{ name: 'new', command: 'poll', description: 'New' }];
    const found = await discover(
      {},
      {
        monitors: [{ name: 'old', command: 'poll', description: 'Old' }],
        experimental: { monitors: inline },
      },
    );
    expect(found.monitors).toEqual([{ inline }]);
  });

  test('a single skill at the plugin root is named after the plugin (judgment); a listed folder after itself', async () => {
    const root = await discoverComponents(
      memoryFiles({ 'SKILL.md': 'Root.' }),
      undefined,
      'formatter',
    );
    expect(namesOf(root.skills)).toEqual(['formatter']);
    const listed = await discover({ 'tools/fmt/SKILL.md': 'F.' }, { skills: './tools/fmt' });
    expect(namesOf(listed.skills)).toEqual(['fmt']);
  });
});
