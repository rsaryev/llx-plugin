/**
 * plugins/install.md § Update plugins now: one plugin through `Update now` or
 * `claude plugin update <plugin>@<marketplace>`; no command updates every plugin at once; the
 * Marketplaces tab's `Update marketplace` refreshes the listing, updates the plugins installed from
 * that marketplace and reports the ones it left to the user (a `command` source and an entry with a
 * `headersHelper`, which are updated from their own view or by `claude plugin update`);
 * `claude plugin marketplace update` with no name refreshes every listing and leaves the installed
 * plugins at their versions. What the docs leave open (the wording of the report, the refresh of a
 * single-plugin update) is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  planUpdate,
  type InstalledForUpdate,
  type UpdateRequest,
} from '../../src/updates/update-targets.ts';
import { spec } from '../support/spec.ts';

const installed = (id: string, extra: Partial<InstalledForUpdate> = {}): InstalledForUpdate => ({
  id,
  marketplace: id.split('@')[1] ?? '',
  ...extra,
});

const PLUGINS: readonly InstalledForUpdate[] = [
  installed('a@acme'),
  installed('b@acme'),
  installed('cmd@acme', { commandSource: true }),
  installed('helper@acme', { headersHelper: 'get-token.sh' }),
  installed('c@other'),
];

const REGISTERED = ['acme', 'other', 'third'];

const plan = (request: UpdateRequest) => planUpdate(request, PLUGINS, REGISTERED);

spec('updates.guide.Update plugins now', () => {
  test('one plugin: Update now, or claude plugin update <plugin>@<marketplace>', () => {
    expect(plan({ kind: 'plugin', id: 'a@acme' })).toMatchObject({
      refresh: [],
      update: ['a@acme'],
      leftToUser: [],
    });
  });

  test('a single command-sourced or headersHelper plugin is updated by its own command, not left', () => {
    expect(plan({ kind: 'plugin', id: 'cmd@acme' })).toMatchObject({
      update: ['cmd@acme'],
      leftToUser: [],
    });
    expect(plan({ kind: 'plugin', id: 'helper@acme' })).toMatchObject({
      update: ['helper@acme'],
      leftToUser: [],
    });
  });

  test('Update marketplace refreshes the listing, then updates the plugins installed from that marketplace', () => {
    const result = plan({ kind: 'marketplace-tab', marketplace: 'acme' });
    expect(result.refresh).toEqual(['acme']);
    expect(result.update).toEqual(['a@acme', 'b@acme']);
    expect(result.update).not.toContain('c@other');
  });

  test('it reports the plugins it left for the user, a command source and a headersHelper entry', () => {
    expect(plan({ kind: 'marketplace-tab', marketplace: 'acme' }).leftToUser).toEqual([
      {
        id: 'cmd@acme',
        reason: 'command-source',
        instruction: 'claude plugin update cmd@acme',
      },
      {
        id: 'helper@acme',
        reason: 'headers-helper',
        instruction: 'claude plugin update helper@acme',
      },
    ]);
  });

  test('a marketplace with nothing installed from it refreshes its listing and updates nothing', () => {
    expect(plan({ kind: 'marketplace-tab', marketplace: 'third' })).toMatchObject({
      refresh: ['third'],
      update: [],
      leftToUser: [],
    });
  });

  test('claude plugin marketplace update with no name refreshes every listing and leaves the installed plugins alone', () => {
    expect(plan({ kind: 'marketplace-listing' })).toEqual({
      refresh: ['acme', 'other', 'third'],
      update: [],
      leftToUser: [],
    });
  });

  test('with a name the command refreshes that listing only', () => {
    expect(plan({ kind: 'marketplace-listing', marketplace: 'other' })).toEqual({
      refresh: ['other'],
      update: [],
      leftToUser: [],
    });
  });
});

describe('update targets, what the docs leave open (spec/judgments.md)', () => {
  test('a single-plugin update names no marketplace refresh', () => {
    expect(plan({ kind: 'plugin', id: 'a@acme' }).refresh).toEqual([]);
  });

  test('a marketplace that is not registered refreshes nothing and updates nothing', () => {
    expect(plan({ kind: 'marketplace-listing', marketplace: 'nowhere' })).toEqual({
      refresh: [],
      update: [],
      leftToUser: [],
    });
    expect(plan({ kind: 'marketplace-tab', marketplace: 'nowhere' })).toEqual({
      refresh: [],
      update: [],
      leftToUser: [],
    });
  });

  test('a plugin that has both a command source and a headersHelper is reported once, as a headersHelper', () => {
    const both = [installed('x@acme', { commandSource: true, headersHelper: 'h.sh' })];
    expect(
      planUpdate({ kind: 'marketplace-tab', marketplace: 'acme' }, both, ['acme']).leftToUser,
    ).toEqual([
      { id: 'x@acme', reason: 'headers-helper', instruction: 'claude plugin update x@acme' },
    ]);
  });
});
