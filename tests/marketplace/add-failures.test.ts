/**
 * plugins/troubleshooting.md: "Marketplace `Marketplace "<name>" not found`", "`Invalid marketplace source
 * format`", "`'<source>' is not a valid GitHub owner/repo shorthand`", "`Invalid git URL`", "`Path does not
 * exist: <path>`", "`Marketplace file not found at <path>/.claude-plugin/marketplace.json`", "`Git clone
 * timed out after 120s`", "`Cannot add marketplace "<name>": Claude Code cannot install plugins from a
 * marketplace with this name`". The words after the quoted part come from `claude plugin marketplace add`
 * 2.1.319 (oracle, spec/judgments.md) and are tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { concludeMarketplaceAdd } from '../../src/cli/marketplace-add.ts';
import {
  ACCEPTED_SOURCE_FORMS,
  addFailureMessage,
  gitUrlRefusal,
  idPartRefusal,
  missingMarketplace,
} from '../../src/marketplace/add-failures.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import { fetched, started } from '../support/marketplace-add.ts';
import { spec } from '../support/spec.ts';

const T = 'marketplace.troubleshooting.';
const SHORTHAND = `${T}'<source>' is not a valid GitHub owner/repo shorthand`;
const message = (text: string): string => {
  const found = parseMarketplaceInput(text);
  return 'message' in found ? found.message : '';
};

spec(`${T}Invalid marketplace source format`, () => {
  test('a bare name and a bare hostname match no accepted form', () => {
    for (const text of ['claude-plugins-official', 'marketplace.anthropic.com']) {
      expect(message(text)).toBe(
        'Invalid marketplace source format. Try: owner/repo, https://..., or ./path',
      );
    }
  });
  test('the accepted forms are the four the docs list', () => {
    expect(ACCEPTED_SOURCE_FORMS).toHaveLength(4);
    expect(parseMarketplaceInput('anthropics/claude-plugins-official')).toMatchObject({
      kind: 'github',
    });
    expect(parseMarketplaceInput('https://x.test/m.json')).toMatchObject({ kind: 'url' });
    expect(parseMarketplaceInput('git@h.test:a/b.git')).toMatchObject({ kind: 'git' });
    expect(parseMarketplaceInput('../m')).toMatchObject({ kind: 'directory' });
  });
});

describe('a source with a slash that is not owner/repo', () => {
  describe('the heading', () => {
    test.each(['github.com/owner/repo', 'gitlab.example.com/group/project', 'owner/repo/extra'])(
      '%p is refused as an invalid GitHub shorthand',
      (text) => {
        expect(message(text)).toStartWith(`'${text}' is not a valid GitHub owner/repo shorthand.`);
      },
    );
  });
  spec(`${SHORTHAND}.A repository on any host`, () => {
    test('the message points to the full clone URL, which is a git source', () => {
      expect(message('gitlab.example.com/group/project')).toContain('full https:// clone URL');
      expect(
        parseMarketplaceInput('https://github.com/anthropics/claude-plugins-official.git'),
      ).toMatchObject({
        kind: 'git',
      });
    });
  });
  spec(`${SHORTHAND}.A hosted marketplace.json`, () => {
    test('the message points to its https:// URL, which is a url source', () => {
      expect(message('github.com/owner/repo')).toContain(
        'hosted marketplace.json, use its https:// URL',
      );
      expect(parseMarketplaceInput('https://example.com/marketplace.json')).toMatchObject({
        kind: 'url',
      });
    });
  });
  spec(`${SHORTHAND}.A local checkout`, () => {
    test('the message points to ./path or an absolute path, which are directory sources', () => {
      expect(message('github.com/owner/repo')).toContain('use ./ or an absolute path');
      expect(parseMarketplaceInput('./checkout')).toMatchObject({ kind: 'directory' });
      expect(parseMarketplaceInput('/srv/checkout')).toMatchObject({ kind: 'directory' });
    });
  });
});

spec(`${T}Path does not exist: <path>`, () => {
  test('names the resolved path', () => {
    expect(addFailureMessage({ kind: 'path-missing', path: '/work/nope' })).toBe(
      'Path does not exist: /work/nope',
    );
  });
  test('a path to any other file fails with the .json message', () => {
    expect(addFailureMessage({ kind: 'not-json', path: '/work/f.txt' })).toStartWith(
      'File path must point to a .json file (marketplace.json)',
    );
  });
});

spec(`${T}Marketplace file not found at <path>/.claude-plugin/marketplace.json`, () => {
  test('the add command reports it as Failed to add marketplace: Marketplace file not found at ...', () => {
    expect(
      addFailureMessage({ kind: 'file-missing', path: '/work/d/.claude-plugin/marketplace.json' }),
    ).toBe(
      'Failed to add marketplace: Marketplace file not found at /work/d/.claude-plugin/marketplace.json',
    );
  });
});

spec(`${T}Git clone timed out after 120s`, () => {
  test('the default 120000 ms reads as 120s and the hint names the variable', () => {
    const text = addFailureMessage({ kind: 'clone-timeout', timeoutMs: 120_000 });
    expect(text).toContain('Git clone timed out after 120s');
    expect(text).toContain('CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS');
  });
  test('a raised limit is reported in seconds', () => {
    expect(addFailureMessage({ kind: 'clone-timeout', timeoutMs: 300_000 })).toContain(
      'after 300s',
    );
  });
});

spec(`${T}Invalid git URL`, () => {
  test('an unsupported protocol is refused with Invalid git URL', () => {
    for (const address of ['git://h.test/a.git', 'ftp://h.test/a.git', 'ext::sh -c x']) {
      expect(gitUrlRefusal(address)).toContain('Invalid git URL');
    }
  });
  test('an address git could read as another server is refused', () => {
    expect(gitUrlRefusal('git@-oProxyCommand=x:a/b.git')).toContain('Invalid git URL');
    expect(gitUrlRefusal('https://-x.test/a.git')).toContain('Invalid git URL');
    expect(gitUrlRefusal('file://remote.test/a.git')).toContain('Invalid git URL');
  });
  test('the supported addresses pass', () => {
    for (const address of [
      'https://h.test/a.git',
      'http://h.test/a.git',
      'ssh://git@h.test/a.git',
      'git+ssh://git@h.test/a.git',
      'git@h.test:a/b.git',
      'file:///srv/a.git',
    ]) {
      expect(gitUrlRefusal(address)).toBeUndefined();
    }
  });
});

spec(`${T}Marketplace "<name>" not found`, () => {
  test('an unknown name has no index to look it up in: the fix is its source', () => {
    expect(missingMarketplace('acme-tools')).toEqual({
      message: 'Marketplace "acme-tools" not found',
    });
  });
  test('a claudeai- name is added from your shell with --claudeai', () => {
    expect(missingMarketplace('claudeai-team').fix).toBe(
      'claude plugin marketplace add --claudeai claudeai-team',
    );
  });
});

spec(`${T}Marketplace "claude-plugins-official" not found`, () => {
  test('the fix is adding anthropics/claude-plugins-official', () => {
    expect(missingMarketplace('claude-plugins-official')).toEqual({
      message: 'Marketplace "claude-plugins-official" not found',
      fix: '/plugin marketplace add anthropics/claude-plugins-official',
    });
  });
});

spec(
  `${T}Cannot add marketplace "<name>": Claude Code cannot install plugins from a marketplace with this name`,
  () => {
    const example = (name: string) =>
      `Cannot add marketplace "${name}": Claude Code cannot install plugins from a marketplace with this name. Each part of a plugin id (plugin@marketplace) may use only the letters a-z and A-Z, digits, ".", "_" and "-", and must start with a letter or digit. The name is set by "name" in the marketplace's marketplace.json; ask its maintainer to change it.`;
    test('_internal breaks the rule by starting with _', () => {
      expect(idPartRefusal('_internal')).toBe(example('_internal'));
    });
    test('the add is refused and registers nothing', () => {
      const start = started({ source: 'acme/tools' });
      const done = concludeMarketplaceAdd(start, fetched('_internal'));
      expect(done.declare).toBeUndefined();
      expect(JSON.stringify(done.output)).toContain(
        JSON.stringify(example('_internal')).slice(1, -1),
      );
    });
    test('a name that fits the rule is not refused', () => {
      for (const name of ['internal-tools', 'a.b_c-1', 'X9'])
        expect(idPartRefusal(name)).toBeUndefined();
    });
  },
);
