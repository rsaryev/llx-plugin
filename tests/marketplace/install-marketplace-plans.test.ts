/**
 * plugins/install.md § Manage marketplaces (list, update and remove, from a shell or a session);
 * plugins/cli-reference.md § plugin marketplace remove (`<name>` required), § Commands in a session.
 * What the commands plan and print is tested with their plans: tests/cli/marketplace-update.test.ts,
 * tests/cli/marketplace-remove.test.ts and tests/updates/update-targets.test.ts (the Marketplaces
 * tab).
 */
import { describe, expect, test } from 'bun:test';
import { marketplaceCommand } from '../../src/marketplace/install-plans.ts';
import { spec } from '../support/spec.ts';

const MANAGE = 'install.guide.Manage marketplaces';

spec(`${MANAGE}.List marketplaces`, () => {
  test('claude plugin marketplace list in a shell, /plugin marketplace list in a session', () => {
    expect(marketplaceCommand('list', 'shell')).toBe('claude plugin marketplace list');
    expect(marketplaceCommand('list', 'session')).toBe('/plugin marketplace list');
  });
});

spec(`${MANAGE}.Update a marketplace's listing`, () => {
  test('the command takes the marketplace name, in a shell and in a session', () => {
    expect(marketplaceCommand('update', 'shell', 'acme')).toBe(
      'claude plugin marketplace update acme',
    );
    expect(marketplaceCommand('update', 'session', 'acme')).toBe('/plugin marketplace update acme');
  });
});

spec(`${MANAGE}.Remove a marketplace`, () => {
  test('the command names the marketplace, in a shell and in a session', () => {
    expect(marketplaceCommand('remove', 'shell', 'acme')).toBe(
      'claude plugin marketplace remove acme',
    );
    expect(marketplaceCommand('remove', 'session', 'acme')).toBe('/plugin marketplace remove acme');
  });
});

describe('the commands', () => {
  test('update takes a name or none; in a session remove with no name opens the Marketplaces tab', () => {
    expect(marketplaceCommand('update', 'shell')).toBe('claude plugin marketplace update');
    expect(marketplaceCommand('remove', 'session')).toBe('/plugin marketplace remove');
  });

  test('a shell remove cannot be built without a name', () => {
    // @ts-expect-error `claude plugin marketplace remove <name>` requires the name.
    const nameless: string = marketplaceCommand('remove', 'shell');
    expect(nameless).toBe('claude plugin marketplace remove');
  });
});
