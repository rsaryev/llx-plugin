/**
 * plugins/troubleshooting.md § `Marketplace "<name>" is added but ignored` (an entry of
 * `known_marketplaces.json` that fails a check made every time the file is read stops loading, with
 * its plugins: its location on a network drive, with `.` or `..` in the path, or unchecked; a git
 * URL that cannot be used; a URL that is no http(s) address; a source that differs from its
 * `extraKnownMarketplaces` entry in user or managed settings; a refused name, `(see the debug
 * log)`), § `Marketplace "<name>" is registered from an untrusted source`, and errors.md (another
 * spelling of a reserved name). The wording of the fix for every reason but the location one, and
 * the trailing period on the Errors tab line, are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import {
  ignoredLine,
  ignoredReason,
  untrustedSource,
  untrustedSourceMessage,
  type IgnoreChecks,
} from '../../src/marketplace/ignored-marketplace.ts';
import type { KnownMarketplace } from '../../src/marketplace/known-marketplaces.ts';
import { spec } from '../support/spec.ts';

const entry = (
  source: MarketplaceSource,
  installLocation = '/p/marketplaces/team-tools',
): KnownMarketplace => ({
  source,
  installLocation,
  lastUpdated: '2026-01-01T00:00:00Z',
});

const GITHUB: MarketplaceSource = { kind: 'github', repo: 'a/b', path: 'm.json' };
const OK: IgnoreChecks = { location: 'local' };
/** Another spelling of the reserved `claude-code-plugins`, refused whatever its source. */
const SPELLING = 'claude.code.plugins';

const LOCATION =
  'Its location is on a network drive, has "." or ".." in its path, or couldn\'t be checked';
const FIX =
  'Re-add the marketplace (one added from a folder or file must be re-added from a copy on this computer), or, to trust a folder on a network drive, declare it under extraKnownMarketplaces in user or managed settings.';

spec(`install.troubleshooting.Marketplace "<name>" is added but ignored`, () => {
  test('a clone on a network drive: the `claude plugin list` line, verbatim', () => {
    const reason = ignoredReason('team-tools', entry(GITHUB), { ...OK, location: 'network' });
    expect(reason && ignoredLine('team-tools', reason, 'list')).toBe(
      `Marketplace team-tools is added but ignored. ${LOCATION}. ${FIX}`,
    );
  });

  test('the Errors tab quotes the name, ends the line after the reason and puts the fix beneath', () => {
    const reason = ignoredReason('team-tools', entry(GITHUB), { ...OK, location: 'network' });
    expect(reason && ignoredLine('team-tools', reason, 'errors-tab')).toEqual({
      message: `Marketplace "team-tools" is added but ignored. ${LOCATION}.`,
      guidance: FIX,
    });
  });

  test('a local folder or file speaks of "The folder or file it was added from"', () => {
    const reason = ignoredReason(
      'team-tools',
      entry({ kind: 'directory', path: '/mnt/share/mk' }, '/mnt/share/mk'),
      {
        ...OK,
        location: 'network',
      },
    );
    expect(reason && ignoredLine('team-tools', reason, 'list')).toStartWith(
      'Marketplace team-tools is added but ignored. The folder or file it was added from is on a network drive, has "." or ".." in its path, or couldn\'t be checked.',
    );
  });

  test.each([
    ['a "." segment', '/p/./mk'],
    ['a ".." segment', '/p/../mk'],
    ['a ".." segment on Windows', 'C:\\p\\..\\mk'],
  ])('%s in the location makes it ignored', (_label, location) => {
    const reason = ignoredReason('t', entry(GITHUB, location), OK);
    expect(reason && ignoredLine('t', reason, 'list')).toContain(LOCATION);
  });

  test('a location that could not be checked is ignored', () => {
    expect(ignoredReason('t', entry(GITHUB), { ...OK, location: 'unchecked' })).toBeDefined();
  });

  test('a file name that merely contains dots is not a dot segment', () => {
    expect(ignoredReason('t', entry(GITHUB, '/p/my..mk/v1.0'), OK)).toBeUndefined();
  });

  test("a git URL Claude Code refuses to clone: `Its git URL can't be used: <reason>`", () => {
    const reason = ignoredReason(
      'git-mk',
      entry({ kind: 'git', url: 'https://169.254.169.254/x.git', path: 'm.json' }),
      OK,
    );
    expect(reason && ignoredLine('git-mk', reason, 'list')).toStartWith(
      "Marketplace git-mk is added but ignored. Its git URL can't be used: ",
    );
    expect(reason?.sentence).toBe(
      'Its git URL can\'t be used: "169.254.169.254" is a loopback, link-local or cloud-metadata address',
    );
  });

  test("a git URL the address check refuses carries that check's message after the colon", () => {
    const reason = ignoredReason(
      'git-mk',
      entry({ kind: 'git', url: 'ext::sh -c x', path: 'm.json' }),
      OK,
    );
    expect(reason?.sentence).toBe(
      'Its git URL can\'t be used: "ext::sh -c x" is not a git URL: it must start with https://, http://, file:// or git@',
    );
  });

  test('a usable git URL is fine', () => {
    expect(
      ignoredReason(
        'g',
        entry({ kind: 'git', url: 'https://git.example.com/x.git', path: 'm.json' }),
        OK,
      ),
    ).toBeUndefined();
  });

  test("a URL that is no https or http address: `Its URL can't be read as an https:// or http:// address`", () => {
    const reason = ignoredReason('u', entry({ kind: 'url', url: 'ftp://example.com/m.json' }), OK);
    expect(reason && ignoredLine('u', reason, 'list')).toStartWith(
      "Marketplace u is added but ignored. Its URL can't be read as an https:// or http:// address.",
    );
    expect(
      ignoredReason('u', entry({ kind: 'url', url: 'https://example.com/m.json' }), OK),
    ).toBeUndefined();
  });

  test('a source that differs from its extraKnownMarketplaces entry in user or managed settings', () => {
    const declared: MarketplaceSource = { kind: 'github', repo: 'a/b', ref: 'v2', path: 'm.json' };
    const reason = ignoredReason('t', entry(GITHUB), { ...OK, declared });
    expect(reason && ignoredLine('t', reason, 'list')).toStartWith(
      "Marketplace t is added but ignored. Its source doesn't match its extraKnownMarketplaces entry in user or managed settings.",
    );
    expect(ignoredReason('t', entry(GITHUB), { ...OK, declared: GITHUB })).toBeUndefined();
  });

  test('a refused name shows "(see the debug log)" in place of a reason', () => {
    const reason = ignoredReason(SPELLING, entry(GITHUB), OK);
    expect(reason && ignoredLine(SPELLING, reason, 'list')).toStartWith(
      `Marketplace ${SPELLING} is added but ignored (see the debug log)`,
    );
  });

  test('a healthy entry is not ignored', () => {
    expect(ignoredReason('t', entry(GITHUB), OK)).toBeUndefined();
  });

  test('the first failing check names the reason, in the order the docs list them', () => {
    const reason = ignoredReason(SPELLING, entry({ kind: 'url', url: 'ftp://x/m.json' }), {
      location: 'network',
    });
    expect(reason && ignoredLine('t', reason, 'list')).toContain(LOCATION);
  });
});

spec(
  [
    `install.troubleshooting.Marketplace "<name>" is registered from an untrusted source`,
    'cli.errors.Marketplace is registered from an untrusted source',
  ],
  () => {
    test('the full message names the reserved name and the fix, verbatim', () => {
      expect(untrustedSourceMessage('claude-community')).toBe(
        `Marketplace "claude-community" is registered from an untrusted source: The name 'claude-community' is reserved for official Anthropic marketplaces. Only repositories from 'github.com/anthropics/' can use this name. To fix it, remove the marketplace and re-add it from the official source.`,
      );
    });
  },
);

spec(`install.troubleshooting.Marketplace "<name>" is registered from an untrusted source`, () => {
  const reserved = 'claude-community';

  test('a reserved name registered from a GitHub repository outside anthropics stops loading, with the message', () => {
    const source: MarketplaceSource = {
      kind: 'github',
      repo: 'acme/claude-community',
      path: 'm.json',
    };
    expect(untrustedSource(reserved, entry(source))).toBe(untrustedSourceMessage(reserved));
    expect(ignoredReason(reserved, entry(source), OK)).toBeUndefined();
  });

  test('the same name from github.com/anthropics/ loads', () => {
    const source: MarketplaceSource = {
      kind: 'github',
      repo: 'anthropics/claude-community',
      path: 'm.json',
    };
    expect(untrustedSource(reserved, entry(source))).toBeUndefined();
    expect(ignoredReason(reserved, entry(source), OK)).toBeUndefined();
  });

  test('a git URL under github.com/anthropics/ loads, one elsewhere does not', () => {
    const official: MarketplaceSource = {
      kind: 'git',
      url: 'https://github.com/anthropics/x.git',
      path: 'm.json',
    };
    const other: MarketplaceSource = {
      kind: 'git',
      url: 'https://git.example.com/anthropics/x.git',
      path: 'm.json',
    };
    expect(untrustedSource(reserved, entry(official))).toBeUndefined();
    expect(untrustedSource(reserved, entry(other))).toBeDefined();
  });

  test('a reserved name from a URL or a local folder is untrusted: only GitHub sources of anthropics may use it', () => {
    expect(
      untrustedSource(reserved, entry({ kind: 'url', url: 'https://x.example/m.json' })),
    ).toBeDefined();
    expect(untrustedSource(reserved, entry({ kind: 'directory', path: '/work/mk' }))).toBeDefined();
  });

  test('a name that is not reserved is trusted from any source', () => {
    expect(untrustedSource('team-tools', entry(GITHUB))).toBeUndefined();
  });

  test('another spelling of a reserved name is refused for the name, not for its source', () => {
    expect(untrustedSource(SPELLING, entry(GITHUB))).toBeUndefined();
    expect(ignoredReason(SPELLING, entry(GITHUB), OK)).toBeDefined();
  });
});

describe('the remove command', () => {
  test('is named in the fix of a refused name, so adding it again under the same name is not suggested', () => {
    const reason = ignoredReason(SPELLING, entry(GITHUB), OK);
    expect(reason && ignoredLine(SPELLING, reason, 'errors-tab')).toEqual({
      message: `Marketplace "${SPELLING}" is added but ignored (see the debug log)`,
      guidance: `Remove it with: claude plugin marketplace remove ${SPELLING}`,
    });
  });
});
