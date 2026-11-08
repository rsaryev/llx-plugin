/**
 * plugins/troubleshooting.md § Plugin archive integrity check failed, § An npm plugin source must
 * name a registry package, § This plugin uses a source type your Claude Code version does not
 * support, § Plugin <name> has a corrupt manifest file or has an invalid manifest file, § Could not
 * move the new copy of this plugin version into <path>, § does not load (...), so Claude Code
 * ignores the whole file. The docs quote some messages whole and some in fragments; the words that
 * join the fragments are the kit's (spec/judgments.md) and are tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import {
  archiveIntegrityMessage,
  failedToInstallPlugin,
  manifestFailureMessage,
  moveFailureMessage,
  settingsIgnoredWarning,
  UNSUPPORTED_SOURCE_TYPE,
} from '../../src/marketplace/install-failures.ts';
import type { CommitFailure } from '../../src/marketplace/ports.ts';
import { spec } from '../support/spec.ts';

const T = 'install.troubleshooting';

const refused = (pkg: string) =>
  planPluginFetch({ kind: 'npm', package: pkg }, { platform: 'posix' }).issues[0]?.message;

spec(`${T}.Plugin archive integrity check failed`, () => {
  test('the whole message, with the url, both digests and what to do', () => {
    expect(
      archiveIntegrityMessage(
        'https://artifacts.example.com/claude-plugins/my-plugin.zip',
        '6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1',
        'ac52220c0914ef8ca6a602e4a7362f88d30fb021110f72a6d15b68c3fe7df2b7',
      ),
    ).toBe(
      'Plugin archive integrity check failed for https://artifacts.example.com/claude-plugins/my-plugin.zip: expected sha256 6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1, got ac52220c0914ef8ca6a602e4a7362f88d30fb021110f72a6d15b68c3fe7df2b7. The archive was not installed. Verify the sha256 in the marketplace entry, or that the URL serves the intended file.',
    );
  });
});

spec(`${T}.An npm plugin source must name a registry package`, () => {
  test('github:acme/formatter is refused before anything is fetched, with the docs message whole', () => {
    expect(refused('github:acme/formatter')).toBe(
      '"github:acme/formatter" was not installed: it is not an http or https link. An npm plugin source must name a registry package (name or name@version) or link to a tarball file. For a plugin in a git repository, use a "github", "url" or "git-subdir" source.',
    );
  });

  test('every refused value gets the same closing sentences, after its own reason', () => {
    for (const pkg of ['./dir', 'npm:other', 'acme/formatter', 'https://github.com/o/r.git']) {
      const message = refused(pkg);
      expect(message?.startsWith(`"${pkg}" was not installed: it is `)).toBe(true);
      expect(message).toContain('An npm plugin source must name a registry package');
    }
  });

  test('a registry package name is not refused', () => {
    expect(
      planPluginFetch({ kind: 'npm', package: '@acme/formatter' }, { platform: 'posix' }),
    ).toMatchObject({ issues: [] });
  });
});

spec(`${T}.This plugin uses a source type your Claude Code version does not support`, () => {
  test('stops with the message and the line that follows it', () => {
    expect(UNSUPPORTED_SOURCE_TYPE).toBe(
      'This plugin uses a source type your Claude Code version does not support. Update Claude Code and try again.',
    );
  });
});

spec(`${T}.Plugin <name> has a corrupt manifest file or has an invalid manifest file`, () => {
  test('a file that is not JSON is a corrupt manifest file followed by JSON parse error:', () => {
    const message = manifestFailureMessage('tmp-1a2b', { parse: 'Unexpected token } in JSON' });
    expect(message).toContain('Plugin tmp-1a2b has a corrupt manifest file');
    expect(message).toContain('JSON parse error: Unexpected token } in JSON');
  });

  test('a file that fails the schema is an invalid manifest file followed by Validation errors:', () => {
    const message = manifestFailureMessage('formatter', { validation: ['name: Invalid input'] });
    expect(message).toContain('Plugin formatter has an invalid manifest file');
    expect(message).toContain('Validation errors: name: Invalid input');
  });

  test('claude plugin install reports either as Failed to install plugin "<name>@<marketplace>":', () => {
    const inner = manifestFailureMessage('tmp-1a2b', { parse: 'x' });
    expect(failedToInstallPlugin('formatter@acme', inner)).toBe(
      `Failed to install plugin "formatter@acme": ${inner}`,
    );
  });

  test('a judgment: several validation errors are joined with a comma', () => {
    expect(
      manifestFailureMessage('p', { validation: ['name: Invalid input', 'version: x'] }),
    ).toContain('Validation errors: name: Invalid input, version: x');
  });
});

const PATH = '/home/user/.claude/plugins/cache/acme-tools/formatter/1.2.0';
const says = (previous: CommitFailure['previous']) =>
  moveFailureMessage(PATH, failure({ previous }));
const failure = (rest: Partial<CommitFailure> = {}): CommitFailure => ({
  failure: 'busy',
  message: 'ENOTEMPTY',
  code: 'ENOTEMPTY',
  previous: 'moved-back',
  ...rest,
});

spec(`${T}.Could not move the new copy of this plugin version into <path>`, () => {
  test('names the path and the file-system code in parentheses, as the docs example does', () => {
    expect(moveFailureMessage(PATH, failure())).toBe(
      `Could not move the new copy of this plugin version into ${PATH}: the new copy or the version folder stayed busy while the install ran (ENOTEMPTY) — usually a scanner still reading the freshly downloaded files, another program using that folder, or another process re-creating it. The previously installed copy was moved back. Run the install again once other Claude Code sessions or programs using that folder have finished.`,
    );
  });

  test('says what became of the copy installed before, in the docs words', () => {
    expect(says('moved-back')).toContain('The previously installed copy was moved back');
    expect(says('removed-first')).toContain('had to be removed first');
    expect(says('not-moved-back')).toContain('was not moved back');
    expect(says('could-not-be-moved-back')).toContain('could not be moved back');
  });

  test('with no earlier copy there is no such sentence', () => {
    const message = moveFailureMessage(PATH, failure({ previous: 'none' }));
    expect(message).not.toContain('previously installed copy');
    expect(message).toContain('stayed busy');
  });

  test('on Windows, a program holding the installed copy says it could not be replaced and the new copy was discarded', () => {
    const message = moveFailureMessage(PATH, failure({ failure: 'held', code: 'EBUSY' }));
    expect(message).toContain('could not be replaced');
    expect(message).toContain('It was not replaced and the new copy was discarded.');
    expect(message).not.toContain('moved back');
  });

  test('a Left on disk list names the set-aside folders', () => {
    const message = moveFailureMessage(
      PATH,
      failure({ leftOnDisk: ['/c/formatter/1.2.0.old-1', '/c/formatter/1.2.0.old-2'] }),
    );
    expect(message).toContain('Left on disk: /c/formatter/1.2.0.old-1, /c/formatter/1.2.0.old-2.');
  });

  test('a cache folder that cannot be written says to check its permissions and free disk space', () => {
    const message = moveFailureMessage(PATH, failure({ failure: 'permission', code: 'EACCES' }));
    expect(message).toContain("Check the plugin cache folder's permissions");
    expect(message).toContain('free disk space');
  });

  test('an abort is not a failed move', () => {
    expect(moveFailureMessage(PATH, failure({ failure: 'aborted' }))).toBeUndefined();
  });
});

spec(`${T}.does not load (...), so Claude Code ignores the whole file`, () => {
  const FOLLOW =
    'so Claude Code ignores the whole file, including anything this command wrote there. Fix the file, then run this command again if its change is missing. If a newer Claude Code wrote the file, update Claude Code instead.';

  test('the docs example, whole', () => {
    expect(
      settingsIgnoredWarning('/home/user/.claude/settings.json', { invalid: ['permissions'] }),
    ).toBe(
      `⚠ /home/user/.claude/settings.json does not load (its "permissions" is not valid), ${FOLLOW}`,
    );
  });

  test('with more than one value failing it names the first and counts the others', () => {
    expect(settingsIgnoredWarning('/s.json', { invalid: ['permissions', 'env'] })).toContain(
      '(its "permissions" and 1 other value are not valid)',
    );
    expect(settingsIgnoredWarning('/s.json', { invalid: ['a', 'b', 'c'] })).toContain(
      '(its "a" and 2 other values are not valid)',
    );
  });

  test('a top level that is not an object says it is not a JSON object', () => {
    expect(settingsIgnoredWarning('/s.json', { notObject: true })).toBe(
      `⚠ /s.json does not load (it is not a JSON object), ${FOLLOW}`,
    );
  });
});

describe('judgments', () => {
  test('a permission failure does not ask to retry before the folder is fixed', () => {
    const message = moveFailureMessage(PATH, failure({ failure: 'permission', code: 'EACCES' }));
    expect(message).not.toContain('Run the install again');
  });
});
