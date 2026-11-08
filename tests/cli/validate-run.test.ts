/**
 * plugins/cli-reference.md § plugin validate: "Validate a directory", "Validate a manifest file",
 * "Output and exit codes" (the verdict line and exit code, `--json`), "Advice on the README";
 * plugins/manifest-reference.md § Validate the manifest. The findings come from `validatePlugin`,
 * whose wording is the oracle's (docs/SPEC.md); what this proves is what the page says about
 * choosing the target, the verdict, the exit code and the report.
 */
import { expect, test } from 'bun:test';
import {
  manifestFileKind,
  unexpectedValidationError,
  validationJson,
  validationVerdict,
} from '../../src/cli/index.ts';
import { validatePlugin } from '../../src/index.ts';
import { readmeAdvice } from '../../src/cli/validate-advice.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

type Tree = Parameters<typeof memoryFiles>[0];

const COMPLETE = { name: 'demo', version: '1.0.0', description: 'Demo', author: { name: 'A' } };
const plugin = (extra: Record<string, unknown> = {}) => JSON.stringify({ ...COMPLETE, ...extra });
const marketplace = (plugins: unknown[] = []) =>
  JSON.stringify({ name: 'shop', owner: { name: 'O' }, description: 'Shop', plugins });
const run = (tree: Tree) => validatePlugin({ files: memoryFiles(tree) });

const MARKET = '.claude-plugin/marketplace.json';
const PLUGIN = '.claude-plugin/plugin.json';

spec(['cli.plugin.Validate a directory', `cli.plugin.Validate a directory.${MARKET}`], () => {
  test('a directory with marketplace.json is validated as a marketplace', async () => {
    expect((await run({ [MARKET]: marketplace(), [PLUGIN]: plugin() })).target).toBe('marketplace');
  });

  test('otherwise plugin.json, otherwise the component files', async () => {
    expect((await run({ [PLUGIN]: plugin() })).target).toBe('plugin');
    expect(
      (await run({ 'skills/a/SKILL.md': '---\nname: a\ndescription: A\n---\nx' })).target,
    ).toBe('components');
  });

  test('with both manifests the plugin manifest is validated too', async () => {
    const report = await run({ [MARKET]: marketplace(), [PLUGIN]: plugin({ version: undefined }) });
    expect(report.issues.map((issue) => issue.file)).toContain(PLUGIN);
  });
});

spec('cli.plugin.Validate a directory.A CLAUDE.md at the plugin root', () => {
  test('a plugin run warns about it', async () => {
    const report = await run({ [PLUGIN]: plugin(), 'CLAUDE.md': 'x' });
    expect(report.issues.map((issue) => [issue.severity, issue.file])).toEqual([
      ['warning', 'CLAUDE.md'],
    ]);
  });
});

spec('cli.plugin.Validate a directory.A SKILL.md at the plugin root', () => {
  test('is not checked: a root SKILL.md with no frontmatter raises no finding', async () => {
    const report = await run({ [PLUGIN]: plugin(), 'SKILL.md': 'no frontmatter at all' });
    expect(report.issues).toEqual([]);
  });
});

spec('cli.plugin.Validate a directory.Plugin files in a marketplace run', () => {
  test('a marketplace run does not open the files of plugins listed in other directories', async () => {
    const report = await run({
      [MARKET]: marketplace([{ name: 'other', source: './plugins/other', description: 'o' }]),
      'plugins/other/.claude-plugin/plugin.json': '{ not json',
      'plugins/other/skills/a/SKILL.md': 'no frontmatter',
    });
    expect(report.issues.filter((issue) => issue.file.startsWith('plugins/other'))).toEqual([]);
  });
});

spec('cli.plugin.Validate a manifest file', () => {
  const kind = (name: string, value: Record<string, unknown>, inDir = false) =>
    manifestFileKind({ name, inClaudePluginDirectory: inDir, value });

  test('the file names decide first, and any other file in .claude-plugin is a plugin manifest', () => {
    expect(kind('marketplace.json', {})).toBe('marketplace');
    expect(kind('plugin.json', { plugins: [] })).toBe('plugin');
    expect(kind('other.json', { plugins: [], owner: {} }, true)).toBe('plugin');
  });

  test('elsewhere the fields decide: a plugins array, plugins with owner, or a marketplace-only field', () => {
    expect(kind('x.json', { plugins: [] })).toBe('marketplace');
    expect(kind('x.json', { plugins: {}, owner: {} })).toBe('marketplace');
    expect(kind('x.json', { owner: { name: 'o' } })).toBe('marketplace');
    expect(kind('x.json', { owner: {}, author: {} })).toBe('plugin');
    expect(kind('x.json', { name: 'n' })).toBe('plugin');
  });
});

const warn = { severity: 'warning' as const };
const fail = { severity: 'error' as const };

spec(
  [
    'cli.plugin.Output and exit codes.0',
    'cli.plugin.Output and exit codes.success',
    'cli.rule.Validate the manifest.Validation passed',
    'cli.rule.Validate the manifest.Validation passed with warnings',
  ],
  () => {
    test('a clean run passes with exit 0', () => {
      expect(validationVerdict([], false)).toEqual({
        success: true,
        exitCode: 0,
        line: 'Validation passed',
      });
    });

    test('a warning passes with warnings, and still exits 0 without --strict', () => {
      expect(validationVerdict([warn], false)).toEqual({
        success: true,
        exitCode: 0,
        line: 'Validation passed with warnings',
      });
    });
  },
);

spec(
  [
    'cli.plugin.Output and exit codes.1',
    'cli.plugin.Output and exit codes.strict',
    'cli.rule.Validate the manifest.Validation failed',
    'cli.rule.Validate the manifest.Errors',
    'cli.rule.Validate the manifest.Warnings',
  ],
  () => {
    test('an error fails with exit 1', () => {
      expect(validationVerdict([fail, warn], false)).toEqual({
        success: false,
        exitCode: 1,
        line: 'Validation failed',
      });
    });

    test('--strict makes a warning fail the run and says so', () => {
      expect(validationVerdict([warn], true)).toEqual({
        success: false,
        exitCode: 1,
        line: 'Validation failed (--strict treats warnings as errors)',
      });
      expect(validationVerdict([], true).exitCode).toBe(0);
    });

    test('a real manifest finds errors and warnings of the kinds the page lists', async () => {
      const missing = await run({ [PLUGIN]: plugin({ commands: './nowhere.md' }) });
      expect(missing.issues.some((issue) => issue.severity === 'error')).toBe(true);
      const unknownField = await run({ [PLUGIN]: plugin({ surprise: 1 }) });
      expect(unknownField.issues.map((issue) => issue.severity)).toEqual(['warning']);
      expect(validationVerdict(unknownField.issues, false).line).toBe(
        'Validation passed with warnings',
      );
    });
  },
);

spec('cli.plugin.Output and exit codes.2', () => {
  test('an unexpected error exits 2 with the reason on stderr', () => {
    expect(unexpectedValidationError('EACCES: permission denied')).toEqual({
      exitCode: 2,
      stderr: 'Unexpected error during validation: EACCES: permission denied',
    });
  });
});

spec(
  [
    'cli.plugin.Output and exit codes.target',
    'cli.plugin.Output and exit codes.manifest',
    'cli.plugin.Output and exit codes.contents',
  ],
  () => {
    const issue = (severity: 'error' | 'warning', file: string, path: string) => ({
      severity,
      file,
      path,
      message: `${path} problem`,
    });

    test('target is the resolved path; manifest is the manifest result; contents hold the other files', () => {
      const json = validationJson({
        target: 'plugin',
        path: '/work/demo',
        strict: false,
        issues: [
          issue('warning', PLUGIN, 'version'),
          issue('error', 'skills/a/SKILL.md', 'frontmatter'),
        ],
      });
      expect(json.target).toBe('/work/demo');
      expect(json.manifest?.file).toBe(PLUGIN);
      expect(json.manifest?.warnings).toEqual([{ path: 'version', message: 'version problem' }]);
      expect(json.contents.map((each) => each.file)).toEqual(['skills/a/SKILL.md']);
      expect(json.contents[0]?.errors).toHaveLength(1);
    });

    test('a run without a manifest has manifest null, and nothing to report leaves contents empty', () => {
      const bare = validationJson({ target: 'components', path: '/w', strict: false, issues: [] });
      expect(bare.manifest).toBeNull();
      expect(bare.contents).toEqual([]);
    });

    test('with marketplace.json and plugin.json, manifest is the marketplace and the plugin goes to contents', () => {
      const json = validationJson({
        target: 'marketplace',
        path: '/w',
        strict: false,
        issues: [issue('warning', MARKET, 'plugins'), issue('warning', PLUGIN, 'version')],
      });
      expect(json.manifest?.file).toBe(MARKET);
      expect(json.contents.map((each) => each.file)).toEqual([PLUGIN]);
    });
  },
);

spec(
  [
    'cli.plugin.Output and exit codes.success',
    'cli.plugin.Output and exit codes.strict',
    'cli.plugin.Output and exit codes.advice',
  ],
  () => {
    test('success follows the verdict and strict says whether warnings failed the run', () => {
      const warned = [{ severity: 'warning' as const, file: PLUGIN, path: 'v', message: 'm' }];
      const loose = validationJson({ target: 'plugin', path: '/w', strict: false, issues: warned });
      const strict = validationJson({ target: 'plugin', path: '/w', strict: true, issues: warned });
      expect([loose.success, loose.strict]).toEqual([true, false]);
      expect([strict.success, strict.strict]).toEqual([false, true]);
    });

    test('advice is listed with the README, the message and the line to paste, empty when none', () => {
      const advice = readmeAdvice({ file: 'README.md', plugin: 'deploy-helper', readme: 'hi' });
      expect(advice).toBeDefined();
      const json = validationJson({
        target: 'plugin',
        path: '/w',
        strict: false,
        issues: [],
        advice: advice ? [advice] : [],
      });
      expect(json.advice).toEqual(advice ? [advice] : []);
      expect(
        validationJson({ target: 'plugin', path: '/w', strict: false, issues: [] }).advice,
      ).toEqual([]);
    });
  },
);
