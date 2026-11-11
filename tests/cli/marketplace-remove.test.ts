/**
 * plugins/cli-reference.md § plugin marketplace remove (`<name>` is the name `list` shows; without
 * `--scope` the declaration goes from every scope; "when you remove a marketplace from the last scope
 * that declares it, Claude Code also deletes its cache and uninstalls every plugin you installed from
 * it", with their options, secrets and data; `Successfully removed marketplace: <name>`, `Also
 * uninstalled 2 plugins from this marketplace:`; the `--scope` failure `Marketplace '<name>' is not
 * declared in project settings. Omit --scope to remove it from all scopes.`; `--json`), § JSON result
 * for marketplace commands (the `marketplace-remove` example; the reserved name). The wording for a
 * marketplace nobody knows, one plugin, and a plugin only managed settings installed are outside
 * `spec(...)` and in spec/judgments.md. plugins/install.md § Manage marketplaces, "Remove a
 * marketplace" (line 382): "Claude Code uninstalls every plugin you installed from it and removes
 * their `enabledPlugins` entries from your settings files. The **Marketplaces** tab names those
 * plugins before it asks you to confirm." "You installed" and "your settings files" leave `managed`
 * out: the uninstall and the entries dropped are user, project and local only.
 */
import { describe, expect, test } from 'bun:test';
import {
  planMarketplaceRemove,
  type RemoveArguments,
  type RemoveFacts,
  type RemovePlan,
} from '../../src/cli/marketplace-remove.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { spec } from '../support/spec.ts';

const NAME = 'your-marketplace';

const facts = (extra: Partial<RemoveFacts> = {}): RemoveFacts => ({
  known: true,
  declaredIn: ['user'],
  plugins: [],
  enabledEntries: [],
  ...extra,
});

const plan = (args: Partial<RemoveArguments>, extra: Partial<RemoveFacts> = {}): RemovePlan =>
  planMarketplaceRemove({ name: NAME, ...args }, facts(extra));

const human = (found: RemovePlan) => renderCommand(found.output, { json: false });

const plugin = (id: string, scopes: RemoveFacts['plugins'][number]['scopes'] = ['user']) => ({
  id,
  scopes,
});

spec(
  [
    'cli.plugin.plugin marketplace remove',
    'marketplace.create.Remove the marketplace to start over',
  ],
  () => {
    test('removes the declaration from every scope that has it, and says so', () => {
      const found = plan({}, { declaredIn: ['user', 'project', 'local'] });
      expect(found.removeFrom).toEqual(['user', 'project', 'local']);
      expect(human(found)).toEqual({
        stdout: [`Successfully removed marketplace: ${NAME}`],
        stderr: [],
        exitCode: 0,
      });
    });

    test('--scope removes the declaration from that one scope only', () => {
      const found = plan({ scope: 'project' }, { declaredIn: ['user', 'project'] });
      expect(found.removeFrom).toEqual(['project']);
    });

    test('from a scope that is not the last, the cache and the plugins stay', () => {
      const found = plan(
        { scope: 'project' },
        { declaredIn: ['user', 'project'], plugins: [plugin(`a@${NAME}`)] },
      );
      expect(found.deleteCache).toBe(false);
      expect(found.uninstall).toEqual([]);
      expect(human(found).stdout).toEqual([`Successfully removed marketplace: ${NAME}`]);
    });

    test('from the last scope that declares it, the cache goes with it', () => {
      expect(plan({ scope: 'user' }, { declaredIn: ['user'] }).deleteCache).toBe(true);
      expect(plan({}, { declaredIn: ['user', 'project'] }).deleteCache).toBe(true);
    });

    test('from the last scope it uninstalls every plugin installed from it, with options, secrets and data', () => {
      const found = plan(
        {},
        {
          declaredIn: ['user', 'project'],
          plugins: [plugin(`a@${NAME}`, ['user', 'project']), plugin(`b@${NAME}`, ['local'])],
        },
      );
      expect(found.uninstall).toEqual([
        {
          id: `a@${NAME}`,
          scopes: ['user', 'project'],
          deleteOptions: true,
          deleteSecrets: true,
          deleteData: true,
        },
        {
          id: `b@${NAME}`,
          scopes: ['local'],
          deleteOptions: true,
          deleteSecrets: true,
          deleteData: true,
        },
      ]);
    });

    test('lists them under Also uninstalled N plugins from this marketplace:', () => {
      const found = plan({}, { plugins: [plugin(`a@${NAME}`), plugin(`b@${NAME}`)] });
      const lines = human(found).stdout.join('\n').split('\n');
      expect(lines[0]).toBe(`Successfully removed marketplace: ${NAME}`);
      expect(lines[1]).toBe('Also uninstalled 2 plugins from this marketplace:');
      expect(lines.slice(2).join('\n')).toContain(`a@${NAME}`);
      expect(lines.slice(2).join('\n')).toContain(`b@${NAME}`);
    });

    test('--scope on a settings file that does not declare it fails and says how to remove it everywhere', () => {
      const found = plan({ scope: 'project' }, { declaredIn: ['user'] });
      expect(human(found)).toEqual({
        stdout: [],
        stderr: [
          `Marketplace '${NAME}' is not declared in project settings. Omit --scope to remove it from all scopes.`,
        ],
        exitCode: 1,
      });
      expect(found.removeFrom).toEqual([]);
      expect(found.deleteCache).toBe(false);
      expect(found.uninstall).toEqual([]);
    });

    test('an invalid --scope is a usage error: no result line, exit 1', () => {
      const rendered = renderCommand(plan({ scope: 'team' }).output, { json: true });
      expect(rendered.stdout).toEqual([]);
      expect(rendered.exitCode).toBe(1);
      expect(rendered.stderr[0]).toContain('team');
    });
  },
);

spec('cli.plugin.JSON result for marketplace commands', () => {
  test('remove --json prints the docs example, field for field', () => {
    const found = plan({ json: true });
    expect(renderCommand(found.output, { json: true }).stdout).toEqual([
      '{"command":"marketplace-remove","outcome":"ok","marketplace":"your-marketplace","message":"Successfully removed marketplace: your-marketplace"}',
    ]);
  });

  test('a failure names the marketplace and carries a failureCode', () => {
    const rendered = renderCommand(plan({ scope: 'project' }).output, { json: true });
    expect(JSON.parse(rendered.stdout.at(-1) ?? '')).toMatchObject({
      command: 'marketplace-remove',
      outcome: 'failed',
      marketplace: NAME,
      failureCode: expect.any(String),
    });
  });

  test('the reserved name anthropic-plugin-directory can print no result line', () => {
    const found = planMarketplaceRemove(
      { name: 'anthropic-plugin-directory', json: true },
      facts(),
    );
    const rendered = renderCommand(found.output, { json: true });
    expect(rendered.stdout).toEqual([]);
    expect(rendered.exitCode).toBe(1);
  });
});

describe('what the docs leave open', () => {
  test('--scope on a settings file that does not declare it carries failureCode not_declared_in_scope', () => {
    const rendered = renderCommand(plan({ scope: 'project' }).output, { json: true });
    expect(JSON.parse(rendered.stdout.at(-1) ?? '')).toMatchObject({
      failureCode: 'not_declared_in_scope',
    });
  });

  test('the reserved name is matched after surrounding whitespace is dropped, as add does', () => {
    const found = planMarketplaceRemove({ name: ' anthropic-plugin-directory ' }, facts());
    expect(renderCommand(found.output, { json: false })).toEqual({
      stdout: [],
      stderr: ['"anthropic-plugin-directory" is a reserved marketplace name'],
      exitCode: 1,
    });
    expect(found.removeFrom).toEqual([]);
  });

  test('a marketplace nobody knows fails with not_found and removes nothing', () => {
    const found = plan({}, { known: false, declaredIn: [] });
    expect(renderCommand(found.output, { json: true }).stdout[0]).toContain(
      '"failureCode":"not_found"',
    );
    expect(found.removeFrom).toEqual([]);
  });

  test('one plugin reads Also uninstalled 1 plugin', () => {
    const found = plan({}, { plugins: [plugin(`a@${NAME}`)] });
    expect(human(found).stdout.join('\n')).toContain(
      'Also uninstalled 1 plugin from this marketplace:',
    );
  });

  test('a plugin that only managed settings installed is not uninstalled: the user cannot', () => {
    const found = plan(
      {},
      { plugins: [plugin(`a@${NAME}`, ['managed']), plugin(`b@${NAME}`, ['user', 'managed'])] },
    );
    expect(found.uninstall.map((one) => [one.id, one.scopes])).toEqual([[`b@${NAME}`, ['user']]]);
  });

  test('a marketplace no settings file declares is still removed from disk', () => {
    const found = plan({}, { declaredIn: [], plugins: [plugin(`a@${NAME}`)] });
    expect(found.deleteCache).toBe(true);
    expect(found.removeFrom).toEqual([]);
    expect(found.uninstall).toHaveLength(1);
  });
});

spec('install.guide.Manage marketplaces.Remove a marketplace', () => {
  const entries: RemoveFacts['enabledEntries'] = [
    { id: `a@${NAME}`, scope: 'user' },
    { id: `a@${NAME}`, scope: 'project' },
    { id: 'b@other', scope: 'user' },
    { id: `c@${NAME}`, scope: 'local' },
  ];

  test('uninstalls every plugin installed from it and drops their enabledPlugins entries from your settings files', () => {
    const found = plan(
      {},
      {
        plugins: [plugin(`a@${NAME}`, ['user', 'project']), plugin(`c@${NAME}`, ['local'])],
        enabledEntries: entries,
      },
    );
    expect(found.uninstall.map((one) => one.id)).toEqual([`a@${NAME}`, `c@${NAME}`]);
    expect(found.dropEnabledEntries).toEqual([
      { id: `a@${NAME}`, scope: 'user' },
      { id: `a@${NAME}`, scope: 'project' },
      { id: `c@${NAME}`, scope: 'local' },
    ]);
  });

  test('from a scope that is not the last, no enabledPlugins entry is dropped', () => {
    const found = plan(
      { scope: 'project' },
      { declaredIn: ['user', 'project'], enabledEntries: entries },
    );
    expect(found.dropEnabledEntries).toEqual([]);
  });

  test('a marketplace with nothing installed from it removes only the marketplace', () => {
    const found = plan({});
    expect(found.uninstall).toEqual([]);
    expect(found.dropEnabledEntries).toEqual([]);
  });
});
