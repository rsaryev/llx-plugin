/**
 * plugins/cli-reference.md § plugin marketplace add (the flags; the table of what you type and the
 * source type it becomes; the success line `Successfully added marketplace: <name> (declared in
 * project settings)`; `already on disk` exits 0; the unrecognized-source and bare-host failures; the
 * dependencies installed plugins lacked are installed after the add; `--claudeai` refuses `--scope`
 * and `--sparse`), § JSON result format and § JSON result for marketplace commands (`command`
 * `marketplace-add`, `marketplace`, `failureCode` such as `invalid_source`; `--json` has no effect
 * with `--claudeai`; the reserved name `anthropic-plugin-directory` can print no result line),
 * plugins/marketplace-reference.md § Reserved names. Where the docs are silent (the usage error of a
 * refused flag combination, the wording of a refused name, the line of a claude.ai add) the tests sit
 * outside `spec(...)` and the choice is in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { concludeMarketplaceAdd, startMarketplaceAdd } from '../../src/cli/marketplace-add.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { facts, installed, plugin } from '../support/dependency-facts.ts';
import {
  FILE,
  concluded,
  fetched,
  finished,
  started,
  stdoutOf,
} from '../support/marketplace-add.ts';
import { spec } from '../support/spec.ts';

spec('cli.plugin.plugin marketplace add', () => {
  test('adds from the source and declares it in the scope, printing the docs line', () => {
    const start = started({ source: 'your-org/your-marketplace', scope: 'project' });
    expect(start.source).toEqual({ kind: 'github', repo: 'your-org/your-marketplace', path: FILE });
    const done = concludeMarketplaceAdd(start, fetched('your-marketplace'));
    expect(done.declare).toEqual({
      scope: 'project',
      name: 'your-marketplace',
      source: start.source,
    });
    expect(renderCommand(done.output, { json: false })).toEqual({
      stdout: ['Successfully added marketplace: your-marketplace (declared in project settings)'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('uses the name from the marketplace manifest, not the source', () => {
    const done = concluded({ source: 'acme/tools' }, fetched('acme-internal-tools'));
    expect(stdoutOf(done.output)).toEqual([
      'Successfully added marketplace: acme-internal-tools (declared in user settings)',
    ]);
  });

  test('a marketplace already on disk prints the docs line, exits 0 and writes the declaration', () => {
    const done = concluded(
      { source: 'your-org/your-marketplace', scope: 'project' },
      fetched('your-marketplace', { alreadyOnDisk: true }),
    );
    expect(renderCommand(done.output, { json: false })).toEqual({
      stdout: ["Marketplace 'your-marketplace' already on disk — declared in project settings"],
      stderr: [],
      exitCode: 0,
    });
    expect(done.declare?.scope).toBe('project');
  });

  test('an unrecognized source fails with the docs line and exit 1', () => {
    const rendered = renderCommand(finished({ source: 'claude-plugins-official' }), {
      json: false,
    });
    expect(rendered.stderr).toEqual([
      'Invalid marketplace source format. Try: owner/repo, https://..., or ./path',
    ]);
    expect(rendered.exitCode).toBe(1);
  });

  test('a bare host fails as an invalid owner/repo shorthand and says to add https:// or use a local path', () => {
    const rendered = renderCommand(finished({ source: 'gitlab.example.com/team/plugins' }), {
      json: false,
    });
    expect(rendered.exitCode).toBe(1);
    expect(rendered.stderr[0]).toContain('not a valid owner/repo shorthand');
    expect(rendered.stderr[0]).toContain('https://');
    expect(rendered.stderr[0]).toContain('local path');
  });

  test('after the add it installs the dependencies installed plugins lacked', () => {
    const graph = facts(
      [plugin('app', { entry: ['lib'] }), plugin('lib'), plugin('standalone')],
      [installed('app@m', { version: '1.0.0', deps: ['lib'] }), installed('standalone@m')],
    );
    const done = concluded({ source: 'acme/tools' }, fetched('m', { graph }));
    expect(done.dependencies).toHaveLength(1);
    const [plan] = done.dependencies;
    expect(plan?.operation).toBe('marketplace-add');
    expect(plan?.steps.map((step) => [step.id, step.action])).toEqual([['lib@m', 'install']]);
  });

  test('installs nothing when every installed plugin already has its dependencies', () => {
    const graph = facts(
      [plugin('app', { entry: ['lib'] }), plugin('lib')],
      [installed('app@m', { deps: ['lib'] }), installed('lib@m', { auto: true })],
    );
    expect(concluded({ source: 'acme/tools' }, fetched('m', { graph })).dependencies).toEqual([]);
  });
});

spec('cli.plugin.plugin marketplace add.--scope <scope>', () => {
  test('defaults to user', () => {
    const start = started({ source: 'acme/tools' });
    expect(start.scope).toBe('user');
    expect(concluded({ source: 'acme/tools' }, fetched('t')).declare?.scope).toBe('user');
  });

  test('names the settings file the marketplace is declared in: user, project or local', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      const done = concluded({ source: 'acme/tools', scope }, fetched('t'));
      expect(done.declare?.scope).toBe(scope);
      expect(stdoutOf(done.output)).toEqual([
        `Successfully added marketplace: t (declared in ${scope} settings)`,
      ]);
    }
  });

  test('another value is a usage error: no result line, exit 1, the reason on stderr, even with --json', () => {
    for (const json of [false, true]) {
      const output = finished({ source: 'acme/tools', scope: 'managed', json });
      expect(output.kind).toBe('usage-error');
      const rendered = renderCommand(output, { json });
      expect(rendered.stdout).toEqual([]);
      expect(rendered.exitCode).toBe(1);
      expect(rendered.stderr[0]).toContain('managed');
    }
  });
});

spec('cli.plugin.plugin marketplace add.--claudeai', () => {
  test('reads the argument as the name of a marketplace hosted on claude.ai, not as a source', () => {
    const start = startMarketplaceAdd({ source: 'claudeai-organization-library', claudeai: true });
    expect(start).toMatchObject({ kind: 'claudeai', name: 'claudeai-organization-library' });
  });

  test('refuses --scope and --sparse', () => {
    const withScope = finished({ source: 'claudeai-x', claudeai: true, scope: 'project' });
    const withSparse = finished({ source: 'claudeai-x', claudeai: true, sparse: ['a'] });
    expect(withScope.kind).toBe('usage-error');
    expect(withSparse.kind).toBe('usage-error');
    expect(renderCommand(withScope, { json: false }).exitCode).toBe(1);
  });

  test('the marketplace is hosted for the account: no settings declaration is written', () => {
    const start = startMarketplaceAdd({ source: 'claudeai-library', claudeai: true });
    if (start.kind !== 'claudeai') throw new Error('not claudeai');
    const done = concludeMarketplaceAdd(start, fetched('claudeai-library'));
    expect(done.declare).toBeUndefined();
  });

  test('--json has no effect: the human line is printed', () => {
    const start = startMarketplaceAdd({ source: 'claudeai-library', claudeai: true, json: true });
    expect(start).toMatchObject({ kind: 'claudeai', json: false });
  });
});

spec('cli.plugin.plugin marketplace add.--json', () => {
  test('prints the result as one object on the last line, with the marketplace the command acted on', () => {
    const done = concluded(
      { source: 'acme/tools', scope: 'project', json: true },
      fetched('tools'),
    );
    expect(stdoutOf(done.output, true)).toEqual([
      '{"command":"marketplace-add","outcome":"ok","marketplace":"tools","message":"Successfully added marketplace: tools (declared in project settings)"}',
    ]);
  });

  test('a failure carries failureCode invalid_source and exits 1', () => {
    const rendered = renderCommand(finished({ source: 'nonsense', json: true }), { json: true });
    expect(rendered.exitCode).toBe(1);
    expect(JSON.parse(rendered.stdout.at(-1) ?? '')).toEqual({
      command: 'marketplace-add',
      outcome: 'failed',
      failureCode: 'invalid_source',
      message: 'Invalid marketplace source format. Try: owner/repo, https://..., or ./path',
    });
  });

  test('the start says whether the host prints the JSON line', () => {
    expect(started({ source: 'acme/tools', json: true }).json).toBe(true);
    expect(started({ source: 'acme/tools' }).json).toBe(false);
  });

  test('the reserved name anthropic-plugin-directory can print no result line, even with --json', () => {
    const output = finished({ source: 'anthropic-plugin-directory', json: true });
    const rendered = renderCommand(output, { json: true });
    expect(rendered.stdout).toEqual([]);
    expect(rendered.exitCode).toBe(1);
  });
});

describe('what the docs leave open', () => {
  test('the reserved name is matched after surrounding whitespace is dropped, as remove does', () => {
    const rendered = renderCommand(finished({ source: ' anthropic-plugin-directory ' }), {
      json: false,
    });
    expect(rendered).toEqual({
      stdout: [],
      stderr: ['"anthropic-plugin-directory" is a reserved marketplace name'],
      exitCode: 1,
    });
  });

  test('a name the registry refuses fails the add, and a reserved name outside github.com/anthropics is one', () => {
    const done = concluded({ source: 'acme/tools' }, fetched('claude-plugins-official'));
    const rendered = renderCommand(done.output, { json: false });
    expect(rendered.exitCode).toBe(1);
    expect(done.declare).toBeUndefined();
    expect(done.dependencies).toEqual([]);
  });

  test('the official name is accepted from a github source under anthropics', () => {
    const done = concluded(
      { source: 'anthropics/claude-plugins-official' },
      fetched('claude-plugins-official'),
    );
    expect(done.declare?.name).toBe('claude-plugins-official');
  });

  test('a name that is the download folder of another registered github marketplace is refused', () => {
    const done = concluded(
      { source: 'acme/other' },
      fetched('acme-x-tools', {
        registered: [{ name: 'x', source: { kind: 'github', repo: 'acme/x-tools', path: FILE } }],
      }),
    );
    expect(renderCommand(done.output, { json: false }).stderr[0]).toContain('acme-x-tools');
  });

  test('a name starting claudeai- is refused for a marketplace that is not hosted on claude.ai', () => {
    const done = concluded({ source: 'acme/tools' }, fetched('claudeai-tools'));
    expect(renderCommand(done.output, { json: false }).stderr[0]).toContain('claudeai-');
  });

  test('a claude.ai add prints the success line without a settings clause', () => {
    const start = startMarketplaceAdd({ source: 'claudeai-library', claudeai: true });
    if (start.kind !== 'claudeai') throw new Error('not claudeai');
    const done = concludeMarketplaceAdd(start, fetched('claudeai-library'));
    expect(stdoutOf(done.output)).toEqual(['Successfully added marketplace: claudeai-library']);
  });

  test('a failed name check installs no dependencies and a refused dependency walk does not fail the add', () => {
    const graph = facts(
      [plugin('app', { entry: ['gone'] })],
      [installed('app@m', { deps: ['gone'] })],
    );
    const done = concluded({ source: 'acme/tools' }, fetched('m', { graph }));
    expect(renderCommand(done.output, { json: false }).exitCode).toBe(0);
    expect(done.dependencies[0]?.ok).toBe(false);
  });
});
