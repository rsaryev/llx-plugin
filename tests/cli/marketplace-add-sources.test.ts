/**
 * cli-reference.md § plugin marketplace add (`--sparse` limits the git checkout to the directories,
 * `github` and `git` sources only; the table of what you type and the source type it becomes:
 * `owner/repo`, `https://github.com/owner/repo`, an `http://` URL, `./path`, `../path`, `/path`,
 * `~/path` to a directory, and the same to a `.json` file; on Windows `.\`, `..\` and `C:\`).
 */
import { expect, test } from 'bun:test';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { FILE, finished, started } from '../support/marketplace-add.ts';
import { spec } from '../support/spec.ts';

spec('cli.plugin.plugin marketplace add.--sparse <paths...>', () => {
  test('limits a github checkout to the directories', () => {
    expect(started({ source: 'acme/mono', sparse: ['plugins', '.claude-plugin'] }).source).toEqual({
      kind: 'github',
      repo: 'acme/mono',
      path: FILE,
      sparsePaths: ['plugins', '.claude-plugin'],
    });
  });

  test('limits a git checkout, whatever form names it', () => {
    for (const source of ['git@example.com:team/mono.git', 'https://example.com/mono.git']) {
      const found: MarketplaceSource = started({ source, sparse: ['plugins'] }).source;
      expect(found).toMatchObject({ kind: 'git', sparsePaths: ['plugins'] });
    }
  });

  test('applies to github and git sources only: url, directory and file sources refuse it', () => {
    for (const source of ['https://example.com/marketplace.json', './dir', './m.json']) {
      expect(finished({ source, sparse: ['plugins'] }).kind).toBe('usage-error');
    }
  });

  test('is left out of the source when not given', () => {
    expect('sparsePaths' in started({ source: 'acme/mono' }).source).toBe(false);
  });
});

spec('cli.plugin.plugin marketplace add.owner/repo', () => {
  test('is a github source, pinned to a ref with #ref or @ref', () => {
    expect(started({ source: 'owner/repo' }).source).toEqual({
      kind: 'github',
      repo: 'owner/repo',
      path: FILE,
    });
    expect(started({ source: 'owner/repo#v1' }).source).toMatchObject({ ref: 'v1' });
    expect(started({ source: 'owner/repo@v1' }).source).toMatchObject({ ref: 'v1' });
  });

  test('must follow GitHub naming rules: the owner and the repo name each break one', () => {
    const refused = [
      'owner/re po',
      '-owner/repo',
      'owner-/repo',
      'o_wner/repo',
      `${'o'.repeat(40)}/repo`,
      `owner/${'r'.repeat(101)}`,
      'owner/.',
      'owner/..',
      'owner/repo/extra',
    ];
    for (const source of refused) {
      const rendered = renderCommand(finished({ source }), { json: false });
      expect({ source, exitCode: rendered.exitCode }).toEqual({ source, exitCode: 1 });
    }
  });

  test('accepts the longest names GitHub allows: 39 characters for the owner, 100 for the repo', () => {
    const repo = `${'o'.repeat(39)}/${'r'.repeat(100)}`;
    expect(started({ source: repo }).source).toMatchObject({ kind: 'github', repo });
  });
});

spec('cli.plugin.plugin marketplace add.https://github.com/owner/repo', () => {
  test('is a git source cloned from the URL with .git appended', () => {
    expect(started({ source: 'https://github.com/owner/repo' }).source).toEqual({
      kind: 'git',
      url: 'https://github.com/owner/repo.git',
      path: FILE,
    });
    expect(started({ source: 'https://gitlab.com/namespace/project' }).source).toMatchObject({
      kind: 'git',
      url: 'https://gitlab.com/namespace/project.git',
    });
  });
});

spec('cli.plugin.plugin marketplace add.http://', () => {
  test('the same forms over http:// are git sources too', () => {
    expect(started({ source: 'http://github.com/owner/repo' }).source).toMatchObject({
      kind: 'git',
      url: 'http://github.com/owner/repo.git',
    });
  });

  test('any other http:// URL is fetched as a marketplace.json', () => {
    expect(started({ source: 'http://example.com/marketplace.json' }).source).toEqual({
      kind: 'url',
      url: 'http://example.com/marketplace.json',
    });
  });
});

spec('cli.plugin.plugin marketplace add../path', () => {
  test('a path to a directory is read in place', () => {
    for (const path of ['./path', '../path', '/path', '~/path']) {
      expect(started({ source: path }).source).toEqual({ kind: 'directory', path });
    }
  });

  test('on Windows the .\\, ..\\ and C:\\ forms work too, and only there', () => {
    expect(started({ source: '.\\mine', platform: 'windows' }).source).toEqual({
      kind: 'directory',
      path: '.\\mine',
    });
    expect(finished({ source: '.\\mine' }).kind).toBe('result');
    expect(started({ source: 'C:\\mine', platform: 'windows' }).source).toEqual({
      kind: 'directory',
      path: 'C:\\mine',
    });
    expect(finished({ source: 'C:\\mine' }).kind).toBe('result');
  });
});

spec('cli.plugin.plugin marketplace add..json', () => {
  test('the same path forms to a .json file read the file in place', () => {
    for (const path of ['./m.json', '../m.json', '/m.json', '~/m.json']) {
      expect(started({ source: path }).source).toEqual({ kind: 'file', path });
    }
  });
});
