/** plugins/dependencies.md § Create a release tag; plugins/cli-reference.md § plugin tag (all flags). */
import { expect, test } from 'bun:test';
import { finishPluginTag, planPluginTag, type TagFacts } from '../../src/cli/tag-plan.ts';
import { spec } from '../support/spec.ts';

const facts: TagFacts = {
  directory: '/repo/plugins/vault',
  manifest: { name: 'vault', version: '2.1.0' },
  validationIssues: [],
  marketplace: { file: '/repo/.claude-plugin/marketplace.json', version: '2.1.0' },
  dirty: false,
  tagExists: false,
};

spec(['dependencies.guide.Create a release tag', 'cli.plugin.plugin tag'], () => {
  test('validates a release and plans an annotated tag and the push command separately', () => {
    const plan = planPluginTag({}, facts);
    expect(plan.ready).toBe(true);
    expect(plan.tag).toBe('vault--v2.1.0');
    expect(plan.commands).toEqual([
      {
        command: 'git',
        args: ['tag', '-a', 'vault--v2.1.0', '-m', 'vault 2.1.0'],
        cwd: facts.directory,
      },
    ]);
    expect(plan.push).toEqual({
      command: 'git',
      args: ['push', 'origin', 'vault--v2.1.0'],
      cwd: facts.directory,
    });
    expect(finishPluginTag(plan, { created: true })).toMatchObject({
      exitCode: 0,
      tagCreated: true,
      lines: ['Created tag vault--v2.1.0', 'git push origin vault--v2.1.0'],
    });
  });
  test('refuses missing versions, mismatches, invalid plugins, dirty trees and existing tags', () => {
    for (const patch of [
      { manifest: { name: 'vault' } },
      { marketplace: { file: 'marketplace.json' } },
      { marketplace: { file: 'marketplace.json', version: '2.0.0' } },
      { dirty: true },
      { tagExists: true },
      { manifest: { name: 'claude', version: '2.1.0' } },
      {
        validationIssues: [
          { severity: 'error' as const, path: 'commands', message: 'missing file' },
        ],
      },
    ]) {
      const plan = planPluginTag({}, { ...facts, ...patch });
      expect(plan.ready).toBe(false);
      expect(plan.commands).toEqual([]);
      expect(finishPluginTag(plan, { created: false }).exitCode).toBe(1);
    }
  });
  test('a standalone plugin needs no marketplace entry', () => {
    const { marketplace: _, ...standalone } = facts;
    expect(planPluginTag({}, standalone).ready).toBe(true);
  });
});

spec('cli.plugin.plugin tag.--dry-run', () => {
  test('prints name, version origin, entry, tag and both commands without effect commands', () => {
    const plan = planPluginTag({ dryRun: true, push: true }, facts);
    expect(plan.commands).toEqual([]);
    expect(plan.preview.join('\n')).toContain('/repo/plugins/vault/.claude-plugin/plugin.json');
    expect(plan.preview.join('\n')).toContain('/repo/.claude-plugin/marketplace.json');
    expect(plan.preview.join('\n')).toContain('git tag -a vault--v2.1.0');
    expect(plan.preview.join('\n')).toContain('git push origin vault--v2.1.0');
    expect(finishPluginTag(plan, { created: false })).toMatchObject({
      exitCode: 0,
      tagCreated: false,
    });
  });
});

spec('cli.plugin.plugin tag.-f, --force', () => {
  test('skips only dirty-tree and tag-exists checks, and never skips validation/version checks', () => {
    expect(
      planPluginTag({ force: true }, { ...facts, dirty: true, tagExists: true }).commands[0]?.args,
    ).toContain('-f');
    expect(planPluginTag({ force: true }, { ...facts, manifest: { name: 'vault' } }).ready).toBe(
      false,
    );
    expect(
      planPluginTag(
        { force: true },
        { ...facts, marketplace: { file: 'm.json', version: '0.0.1' } },
      ).ready,
    ).toBe(false);
  });
});

spec('cli.plugin.plugin tag.-m, --message <msg>', () => {
  test('substitutes %s with the version in the annotation', () => {
    expect(planPluginTag({ message: 'Release %s' }, facts).commands[0]?.args).toEqual([
      'tag',
      '-a',
      'vault--v2.1.0',
      '-m',
      'Release 2.1.0',
    ]);
  });
});

spec(['cli.plugin.plugin tag.--push', 'cli.plugin.plugin tag.--remote <name>'], () => {
  test('pushes after creation, defaults to origin and accepts a selected remote', () => {
    const plan = planPluginTag({ push: true, remote: 'upstream' }, facts);
    expect(plan.commands.map((command) => command.args)).toEqual([
      ['tag', '-a', 'vault--v2.1.0', '-m', 'vault 2.1.0'],
      ['push', 'upstream', 'vault--v2.1.0'],
    ]);
    expect(finishPluginTag(plan, { created: true, pushed: true }).lines).toEqual([
      'Created tag vault--v2.1.0',
      'Pushed to upstream',
    ]);
    expect(
      finishPluginTag(plan, { created: true, pushed: false, error: 'remote refused' }),
    ).toMatchObject({
      exitCode: 1,
      tagCreated: true,
      lines: ['Created tag vault--v2.1.0', 'remote refused'],
    });
    expect(planPluginTag({ push: true }, facts).commands[1]?.args[1]).toBe('origin');
  });
});
