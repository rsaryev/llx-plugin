/**
 * plugins/manifest-reference.md § Standard layout (the default location and contents of each
 * component, including "A plugin with `SKILL.md` at its root, no `skills/`, and no `skills` key loads
 * as a single skill", "Flat Markdown command files", "Subfolders are part of the agent name");
 * plugins/components.md § Commands ("A subdirectory adds a segment, so `commands/db/migrate.md` is
 * `/my-plugin:db:migrate`"), § Agents and § Organize agents in subfolders (`agents/review/security.md`
 * in `my-plugin` loads as `my-plugin:review:security`; "a file you list there loads without subfolder
 * names"), § Themes and output styles, § Default settings, § Executables.
 *
 * Discovery returns paths and names only: what a skill, agent or hook file contains is the owning
 * stream's. Each test places files in an in-memory folder and asserts what is found and, as the docs
 * state, what is not.
 */
import { describe, expect, test } from 'bun:test';
import { discoverComponents } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { json, manifestOf, namesOf, pathsOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const discover = (tree: Record<string, string>, manifest?: unknown) =>
  discoverComponents(memoryFiles(tree), manifest ? manifestOf(manifest) : undefined, 'my-plugin');

spec('layout.Skills', () => {
  test('each skills/<name>/SKILL.md is one skill; folders without one and loose files are not', async () => {
    const found = await discover({
      'skills/review/SKILL.md': 'Review.',
      'skills/review/checklist.md': 'supporting file',
      'skills/lint/SKILL.md': 'Lint.',
      'skills/notes/README.md': 'not a skill',
      'skills/stray.md': 'not a skill',
      'other/hidden/SKILL.md': 'outside the default location',
    });
    expect(pathsOf(found.skills)).toEqual(['skills/lint/SKILL.md', 'skills/review/SKILL.md']);
    expect(namesOf(found.skills)).toEqual(['lint', 'review']);
    expect(found.skills.map((skill) => skill.directory)).toEqual(['skills/lint', 'skills/review']);
  });

  test('a SKILL.md at the plugin root loads as a single skill when there is no skills/ and no skills key', async () => {
    const found = await discover({ 'SKILL.md': 'Only skill.', 'README.md': 'x' });
    expect(pathsOf(found.skills)).toEqual(['SKILL.md']);
    expect(found.skills[0]?.directory).toBe('.');
  });

  test('the root SKILL.md is not a skill once skills/ exists', async () => {
    const found = await discover({ 'SKILL.md': 'Root.', 'skills/a/SKILL.md': 'A.' });
    expect(pathsOf(found.skills)).toEqual(['skills/a/SKILL.md']);
  });

  test('the root SKILL.md is not a skill once the skills key is set', async () => {
    const found = await discover(
      { 'SKILL.md': 'Root.', 'extra/b/SKILL.md': 'B.' },
      { name: 'my-plugin', skills: './extra' },
    );
    expect(pathsOf(found.skills)).toEqual(['extra/b/SKILL.md']);
  });
});

spec('layout.Commands', () => {
  test('commands/*.md are the commands; other files are not', async () => {
    const found = await discover({
      'commands/status.md': 'Status.',
      'commands/deploy.md': 'Deploy.',
      'commands/notes.txt': 'not a command',
      'status.md': 'outside the default location',
    });
    expect(pathsOf(found.commands)).toEqual(['commands/deploy.md', 'commands/status.md']);
    expect(namesOf(found.commands)).toEqual(['deploy', 'status']);
  });

  test('a subdirectory adds a segment to the name (components.md: commands/db/migrate.md is db:migrate)', async () => {
    const found = await discover({
      'commands/db/migrate.md': 'Migrate.',
      'commands/about.md': 'A.',
    });
    expect(namesOf(found.commands)).toEqual(['about', 'db:migrate']);
  });
});

spec('layout.Agents', () => {
  test('agents/*.md are the agents; other files are not', async () => {
    const found = await discover({
      'agents/reviewer.md': 'Reviewer.',
      'agents/README.txt': 'not an agent',
    });
    expect(pathsOf(found.agents)).toEqual(['agents/reviewer.md']);
    expect(namesOf(found.agents)).toEqual(['reviewer']);
  });

  test('subfolders are part of the name, joined with colons (agents/review/security.md is review:security)', async () => {
    const found = await discover({
      'agents/review/security.md': 'S.',
      'agents/review/deep/audit.md': 'A.',
      'agents/tester.md': 'T.',
    });
    expect(namesOf(found.agents)).toEqual(['review:deep:audit', 'review:security', 'tester']);
  });

  test('a file listed in the manifest loads without subfolder names', async () => {
    const found = await discover(
      { 'custom/review/security.md': 'S.' },
      { name: 'my-plugin', agents: './custom/review/security.md' },
    );
    expect(namesOf(found.agents)).toEqual(['security']);
  });
});

spec('layout.Output styles', () => {
  test('output-styles/*.md are the output styles', async () => {
    const found = await discover({
      'output-styles/terse.md': 'Terse.',
      'output-styles/notes.txt': 'no',
      'styles/other.md': 'outside the default location',
    });
    expect(pathsOf(found.outputStyles)).toEqual(['output-styles/terse.md']);
    expect(namesOf(found.outputStyles)).toEqual(['terse']);
  });
});

spec('layout.Workflows', () => {
  test('workflows/*.js are the workflows', async () => {
    const found = await discover({
      'workflows/release-audit.js': 'export default {}',
      'workflows/README.md': 'no',
    });
    expect(pathsOf(found.workflows)).toEqual(['workflows/release-audit.js']);
    expect(namesOf(found.workflows)).toEqual(['release-audit']);
  });
});

spec('layout.Themes', () => {
  test('themes/*.json are the themes', async () => {
    const found = await discover({
      'themes/dracula.json': json({ name: 'Dracula', base: 'dark' }),
      'themes/notes.md': 'no',
    });
    expect(pathsOf(found.themes)).toEqual(['themes/dracula.json']);
    expect(namesOf(found.themes)).toEqual(['dracula']);
  });
});

spec('layout.Hooks', () => {
  test('hooks/hooks.json is the hooks file; a hooks.json elsewhere is not', async () => {
    const found = await discover({
      'hooks/hooks.json': '{}',
      'hooks.json': '{}',
      'config/hooks.json': '{}',
    });
    expect(found.hooks).toEqual([{ file: 'hooks/hooks.json', written: 'hooks/hooks.json' }]);
  });

  test('no hooks file, no hooks source', async () => {
    expect((await discover({ 'hooks/other.json': '{}' })).hooks).toEqual([]);
  });
});

spec('layout.LSP servers', () => {
  test('.lsp.json is the LSP configuration; lsp.json is not', async () => {
    const found = await discover({ '.lsp.json': '{}', 'lsp.json': '{}' });
    expect(found.lspServers).toEqual([{ file: '.lsp.json', written: '.lsp.json' }]);
  });
});

spec('layout.Monitors', () => {
  test('monitors/monitors.json is the monitors array; another file in monitors/ is not', async () => {
    const found = await discover({ 'monitors/monitors.json': '[]', 'monitors/extra.json': '[]' });
    expect(found.monitors).toEqual([
      { file: 'monitors/monitors.json', written: 'monitors/monitors.json' },
    ]);
  });
});

spec('layout.Settings', () => {
  test('settings.json at the plugin root is the plugin settings; one inside .claude-plugin is not', async () => {
    expect((await discover({ 'settings.json': '{}' })).settingsFile).toBe('settings.json');
    expect((await discover({ '.claude-plugin/settings.json': '{}' })).settingsFile).toBeUndefined();
  });
});

spec('layout.Executables', () => {
  test('bin/ is the executables directory: its files are listed and the plugin has one', async () => {
    const found = await discover({
      'bin/deploy-tool': '#!/bin/bash',
      'bin/other': '#!/bin/bash',
      'scripts/format.sh': 'x',
    });
    expect(found.bin).toEqual({ present: true, files: ['bin/deploy-tool', 'bin/other'] });
  });

  test('a plugin with no bin/ has no executables; scripts/ is not bin/', async () => {
    const found = await discover({ 'scripts/format.sh': 'x' });
    expect(found.bin).toEqual({ present: false, files: [] });
  });

  test('an empty bin/ still counts: the directory is what claude.ai and Cowork refuse', async () => {
    const found = await discover({ 'bin/.keep': '' });
    expect(found.bin.present).toBe(true);
  });
});

describe('discovery outside the documented layout (judgments)', () => {
  test('output styles, workflows and themes are one folder deep; a file listed in the manifest is taken whatever its extension', async () => {
    const found = await discover(
      { 'output-styles/sub/deep.md': 'D.', 'styles/loud.markdown': 'L.' },
      { name: 'my-plugin', outputStyles: './styles/loud.markdown' },
    );
    expect(namesOf(found.outputStyles)).toEqual(['loud']);
    expect(namesOf((await discover({ 'output-styles/sub/deep.md': 'D.' })).outputStyles)).toEqual(
      [],
    );
  });

  test('a symlink loop does not hang the scan', async () => {
    const files = memoryFiles({ 'commands/a.md': 'A.', 'commands/loop': { symlink: 'commands' } });
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.commands)).toContain('a');
  });
});
