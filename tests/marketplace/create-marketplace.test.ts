/**
 * plugins/create-marketplace.md § Write relative paths from the marketplace root, § Problems that
 * validation reports, § Problems that surface when you add or install, § Test an edit to a plugin,
 * § Remove the marketplace to start over. Validator output is `claude plugin validate` of 2.1.319 where the
 * docs quote only the start of a message.
 */
import { expect, test } from 'bun:test';
import { validatePlugin } from '../../src/index.ts';
import { addFailureMessage } from '../../src/marketplace/add-failures.ts';
import { loadNameIssues } from '../../src/format/marketplace/marketplace-names.ts';
import { decideInstallMode } from '../../src/marketplace/install-mode.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const C = 'marketplace.create.';
const MARKET = '.claude-plugin/marketplace.json';
type Tree = Parameters<typeof memoryFiles>[0];
const market = (plugins: unknown[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: 'shop', owner: { name: 'O' }, description: 'Shop', plugins, ...extra });
const found = async (tree: Tree) =>
  (await validatePlugin({ files: memoryFiles(tree) })).issues.map((issue) => ({
    severity: issue.severity,
    path: issue.path,
    message: issue.message,
  }));

spec(`${C}Write relative paths from the marketplace root`, () => {
  test('a source with .. is reported as an error beginning Path contains ".."', async () => {
    const [issue, ...rest] = await found({
      [MARKET]: market([{ name: 'my-first-plugin', source: './../plugins/my-first-plugin' }]),
    });
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({ severity: 'error' });
    expect(issue?.message).toBe('Path contains "..": ./../plugins/my-first-plugin');
  });
  test('a path to a directory that does not exist passes validation, and install fails naming the absolute path', async () => {
    expect(await found({ [MARKET]: market([{ name: 'a', source: './plugins/missing' }]) })).toEqual(
      [],
    );
    expect(
      addFailureMessage({
        kind: 'source-path-missing',
        path: '/work/my-marketplace/plugins/missing',
      }),
    ).toBe('Source path does not exist: /work/my-marketplace/plugins/missing');
  });
  test('the walkthrough source ./plugins/my-first-plugin is clean', async () => {
    expect(
      await found({
        [MARKET]: market([{ name: 'my-first-plugin', source: './plugins/my-first-plugin' }]),
      }),
    ).toEqual([]);
  });
});

spec(`${C}Problems that validation reports`, () => {
  test('JSON syntax errors are json: Invalid JSON syntax: <reason>', async () => {
    const [issue] = await found({ [MARKET]: '{ "name": ' });
    expect(issue?.path).toBe('json');
    expect(issue?.message).toStartWith('Invalid JSON syntax: ');
  });
  test('a missing required field is owner: Invalid input', async () => {
    const [issue] = await found({ [MARKET]: JSON.stringify({ name: 'shop', plugins: [] }) });
    expect(issue).toMatchObject({ severity: 'error', path: 'owner' });
    expect(issue?.message).toStartWith('Invalid input');
  });
  test('a marketplace or plugin name that breaks the naming rules is an error', async () => {
    const issues = await found({ [MARKET]: market([{ name: 'a b', source: './a' }]) });
    expect(
      issues.some((issue) => issue.severity === 'error' && issue.path === 'plugins.0.name'),
    ).toBe(true);
  });
  test('unknown fields at the top level or in a plugin entry are warnings', async () => {
    const issues = await found({
      [MARKET]: market([{ name: 'a', source: './a', bogus: 1 }], { extra: 1 }),
    });
    expect(issues.map((issue) => [issue.severity, issue.path])).toEqual([
      ['warning', 'extra'],
      ['warning', 'plugins[0].bogus'],
    ]);
  });
  test('a problem in the plugin.json of a relative-path plugin is plugins[N] plugin.json → <field>: <message>', async () => {
    const [issue] = await found({
      [MARKET]: market([{ name: 'a', source: './a' }]),
      'a/.claude-plugin/plugin.json': '{"name":"a","version":5}',
    });
    expect(issue?.path).toBe('plugins[0] plugin.json → version');
    expect(issue?.message).toStartWith('Invalid input');
  });
});

spec(`${C}Problems that surface when you add or install`, () => {
  test('an exact official name passes validation', async () => {
    const issues = await found({
      [MARKET]: market([], { name: 'claude-plugins-official' }),
    });
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
  test("adding a marketplace with one of those names is refused with a message starting The name '<name>' is reserved for official Anthropic marketplaces", () => {
    const [first] = loadNameIssues('claude-plugins-official', {
      origin: { kind: 'git', url: 'https://example.com/m.git', path: MARKET },
    });
    expect(first?.message).toStartWith(
      "The name 'claude-plugins-official' is reserved for official Anthropic marketplaces",
    );
  });
  test('a wrong repo or path in a remote source appears at install, as the fetch error, not in validation', async () => {
    const issues = await found({
      [MARKET]: market([{ name: 'a', source: { source: 'github', repo: 'nobody/nothing' } }]),
    });
    expect(issues).toEqual([]);
  });
  test('a missing relative source directory fails at install with Source path does not exist: <path>', () => {
    expect(addFailureMessage({ kind: 'source-path-missing', path: '/m/plugins/x' })).toStartWith(
      'Source path does not exist: ',
    );
  });
});

spec(`${C}Test an edit to a plugin`, () => {
  const decide = (marketplace: 'directory' | 'git') => {
    const decided = decideInstallMode({
      origin: {
        kind: 'marketplace',
        marketplace,
        source: { kind: 'relative', path: 'plugins/a', bare: false },
      },
      platform: 'posix',
    });
    if ('severity' in decided) throw new Error(decided.message);
    return decided;
  };
  test('a directory marketplace with a relative-path source is read in place, so an edit needs no version change', () => {
    expect(decide('directory')).toMatchObject({
      mode: 'in-place',
      cached: false,
      editsNeedUpdate: false,
    });
  });
  test('people who install from a hosted marketplace get a copy in the plugin cache instead', () => {
    expect(decide('git')).toMatchObject({ mode: 'copy', cached: true, editsNeedUpdate: true });
  });
});
