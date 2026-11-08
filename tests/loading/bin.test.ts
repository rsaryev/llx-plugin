/**
 * plugins/components.md § Executables ("Plugin `bin/` directories come after the user's own `PATH`
 * entries, so a plugin can't shadow `git`, `ls`, or another system command"; "claude.ai and Cowork
 * don't install a plugin that has a top-level `bin/` directory"); plugins/manifest-reference.md
 * § Standard layout (the same two statements for `bin/`).
 *
 * The three decisions are pure: which directory a plugin puts on `PATH`, where it goes among the
 * user's entries, and which hosts take a plugin that has one. Target names and wording are the
 * kit's (judgment, spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import {
  binPathEntries,
  distribution,
  DISTRIBUTION_TARGETS,
  pathWithPluginBins,
} from '../../src/index.ts';
import { locations } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

spec('layout.Executables', () => {
  test('a plugin with bin/ puts its absolute bin directory on the path; one without puts none', () => {
    const where = locations({ plugins: '/plugins' });
    expect(binPathEntries({ hasBin: true }, 'tools@market', where)).toEqual([
      '/plugins/tools@market/bin',
    ]);
    expect(binPathEntries({ hasBin: false }, 'tools@market', where)).toEqual([]);
  });

  test('plugin bin directories come after every user entry, in plugin order', () => {
    expect(
      pathWithPluginBins(
        ['/usr/local/bin', '/usr/bin', '/bin'],
        ['/plugins/a/bin', '/plugins/b/bin'],
      ),
    ).toEqual(['/usr/local/bin', '/usr/bin', '/bin', '/plugins/a/bin', '/plugins/b/bin']);
  });

  test('a plugin with no bin/ adds nothing: the user path is unchanged', () => {
    expect(pathWithPluginBins(['/usr/bin', '/bin'], [])).toEqual(['/usr/bin', '/bin']);
  });

  test('a directory the user already lists keeps its own position and is not repeated (judgment)', () => {
    expect(
      pathWithPluginBins(
        ['/usr/bin', '/plugins/a/bin', '/bin'],
        ['/plugins/a/bin', '/plugins/b/bin'],
      ),
    ).toEqual(['/usr/bin', '/plugins/a/bin', '/bin', '/plugins/b/bin']);
  });

  test('two plugins listing the same directory add it once', () => {
    expect(pathWithPluginBins(['/bin'], ['/plugins/a/bin', '/plugins/a/bin'])).toEqual([
      '/bin',
      '/plugins/a/bin',
    ]);
  });

  test('claude.ai and Cowork refuse a plugin that has bin/ and take one that does not', () => {
    for (const [target, surface] of [
      ['claude-ai', 'claude.ai'],
      ['cowork', 'Cowork'],
    ] as const) {
      expect(distribution({ hasBin: true }, target)).toEqual({
        installable: false,
        reason: `${surface} doesn't install a plugin that has a top-level bin/ directory`,
      });
      expect(distribution({ hasBin: false }, target)).toEqual({ installable: true });
    }
  });

  test('Claude Code takes a plugin whether or not it has bin/', () => {
    expect(distribution({ hasBin: true }, 'claude-code')).toEqual({ installable: true });
    expect(distribution({ hasBin: false }, 'claude-code')).toEqual({ installable: true });
  });

  test('the targets are the three the docs name', () => {
    expect([...DISTRIBUTION_TARGETS]).toEqual(['claude-code', 'claude-ai', 'cowork']);
  });
});
