/**
 * plugins/cli-reference.md § Advice on the README: a README with no line that installs the plugin from
 * a marketplace gets the line to add; "An install line you already wrote counts"; the line holds
 * `<owner>/<repo>` until the source is known; advice never changes the verdict.
 */
import { expect, test } from 'bun:test';
import { renderAdvice, sourceFromOrigin } from '../../src/cli/index.ts';
import {
  adviceNeedsSource,
  readmeAdvice,
  readmeInstallsPlugin,
} from '../../src/cli/validate-advice.ts';
import { spec } from '../support/spec.ts';
import { validationVerdict } from '../../src/cli/validate-run.ts';

spec('cli.plugin.Advice on the README', () => {
  const README = 'plugins/deploy-helper/README.md';

  test('a README without an install line gets the line to add, and the block prints as the page shows', () => {
    const advice = readmeAdvice({
      file: `/path/to/acme-tools/${README}`,
      plugin: 'deploy-helper',
      readme: '# Deploy helper',
      source: 'acme/tools',
    });
    expect(advice).toEqual({
      file: `/path/to/acme-tools/${README}`,
      message:
        'This README has no line that installs "deploy-helper" from a marketplace. Add the install line, which works in one step on Claude Code 2.1.275 or later.',
      installLine: '/plugin install deploy-helper --marketplace acme/tools',
    });
    expect(renderAdvice(advice ? [advice] : [])).toEqual([
      'ℹ Advice (does not change the verdict):',
      '',
      `  ❯ /path/to/acme-tools/${README}: ${advice?.message}`,
      '      /plugin install deploy-helper --marketplace acme/tools',
    ]);
    expect(renderAdvice([])).toEqual([]);
  });

  test('advice never changes the verdict', () => {
    expect(validationVerdict([], true)).toEqual({
      success: true,
      exitCode: 0,
      line: 'Validation passed',
    });
  });

  test.each([
    '/plugin install deploy-helper@acme-tools',
    'claude plugin install deploy-helper@acme-tools',
    '/plugin i deploy-helper@acme-tools',
    '/plugin install deploy-helper --marketplace acme/tools',
    'Run `claude plugin i deploy-helper --marketplace acme/tools` today',
  ])('an install line you wrote counts: %s', (line) => {
    expect(readmeInstallsPlugin(`# x\n\n${line}\n`, 'deploy-helper')).toBe(true);
  });

  test.each([
    '/plugin install deploy-helper',
    '/plugin install other@acme-tools',
    '/plugin install deploy-helper --marketplace',
    'plugin installs deploy-helper@acme-tools',
  ])('a line that does not count: %s', (line) => {
    expect(readmeInstallsPlugin(line, 'deploy-helper')).toBe(false);
  });

  test('without a source the line holds <owner>/<repo>, which does not clear the advice; the origin fills it', () => {
    const advice = readmeAdvice({ file: 'README.md', plugin: 'p', readme: '' });
    expect(advice?.installLine).toBe('/plugin install p --marketplace <owner>/<repo>');
    expect(advice && adviceNeedsSource(advice)).toBe(true);
    expect(sourceFromOrigin('https://github.com/acme/tools.git')).toBe('acme/tools');
    expect(sourceFromOrigin('git@github.com:acme/tools.git')).toBe('acme/tools');
    expect(sourceFromOrigin('https://example.com/acme/tools.git')).toBeUndefined();
    expect(sourceFromOrigin(undefined)).toBeUndefined();
  });
});
