/**
 * plugins/cli-reference.md § plugin marketplace update (refreshes one marketplace or every one from
 * its source; a marketplace added with a `ref` updates to the latest commit of that ref, not the
 * default branch; `--json` without a name is refused with exit 1; `Successfully updated marketplace:
 * <name>`, `Successfully updated 2 marketplaces`), plugins/install.md § Update plugins now (with no
 * name it refreshes every marketplace's listing and leaves the installed plugins at their versions),
 * plugins/troubleshooting.md § `Plugin "<name>" not found in marketplace "<marketplace>"` (`claude
 * plugin marketplace update <marketplace>` answers `Marketplace '<marketplace>' not found` for a
 * marketplace never added) and § `Marketplace '<name>' is seed-managed` (the update fails with
 * `Marketplace '<name>' is seed-managed (<dir>)` and a hint to ask the admin; a bulk update skips it),
 * § JSON result for marketplace commands (`marketplace-update`). What the docs do not give (the exit
 * code and `failureCode` of both failures, the seed-managed hint, one marketplace, none registered)
 * is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  planMarketplaceUpdate,
  type UpdateFacts,
  type UpdateArguments,
} from '../../src/cli/marketplace-update.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { spec } from '../support/spec.ts';

const facts: UpdateFacts = {
  registered: [{ name: 'alpha' }, { name: 'beta', ref: 'v2' }, { name: 'gamma', seeded: '/seed' }],
};

const run = (args: UpdateArguments, registered: UpdateFacts = facts) =>
  planMarketplaceUpdate(args, registered);
const text = (args: UpdateArguments, registered: UpdateFacts = facts) =>
  renderCommand(run(args, registered).output, { json: false });

spec('cli.plugin.plugin marketplace update', () => {
  test('refreshes the one marketplace and prints Successfully updated marketplace: <name>', () => {
    const plan = run({ name: 'alpha' });
    expect(plan.refresh).toEqual([{ name: 'alpha' }]);
    expect(text({ name: 'alpha' })).toEqual({
      stdout: ['Successfully updated marketplace: alpha'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('with no name it refreshes every marketplace and prints a count', () => {
    const plan = run({}, { registered: [{ name: 'alpha' }, { name: 'beta' }] });
    expect(plan.refresh.map((target) => target.name)).toEqual(['alpha', 'beta']);
    expect(text({}, { registered: [{ name: 'alpha' }, { name: 'beta' }] }).stdout).toEqual([
      'Successfully updated 2 marketplaces',
    ]);
  });

  test('refreshes listings only: no installed plugin is updated', () => {
    expect(run({}).update).toEqual([]);
    expect(run({ name: 'alpha' }).update).toEqual([]);
  });

  test('a marketplace added with a ref updates to the latest commit of that ref, not the default branch', () => {
    expect(run({ name: 'beta' }).refresh).toEqual([{ name: 'beta', ref: 'v2' }]);
    expect(run({ name: 'alpha' }).refresh).toEqual([{ name: 'alpha' }]);
  });

  test('without a name it refuses --json and exits 1, printing no result line', () => {
    const rendered = renderCommand(run({ json: true }).output, { json: true });
    expect(rendered.stdout).toEqual([]);
    expect(rendered.exitCode).toBe(1);
    expect(rendered.stderr[0]).toContain('--json');
    expect(run({ json: true }).refresh).toEqual([]);
  });

  test('a marketplace that was never added answers Marketplace <name> not found and refreshes nothing', () => {
    const plan = run({ name: 'nowhere' });
    expect(plan.output).toMatchObject({ result: { message: "Marketplace 'nowhere' not found" } });
    expect(plan.refresh).toEqual([]);
  });

  test('a seed-managed marketplace named fails with its directory; a bulk update skips it and updates the others', () => {
    const named = run({ name: 'gamma' });
    expect(named.output).toMatchObject({
      result: { message: expect.stringContaining("Marketplace 'gamma' is seed-managed (/seed)") },
    });
    expect(named.refresh).toEqual([]);
    expect(run({}).refresh.map((target) => target.name)).toEqual(['alpha', 'beta']);
    expect(text({}).stdout).toEqual(['Successfully updated 2 marketplaces']);
  });
});

spec('cli.plugin.JSON result for marketplace commands', () => {
  test('update --json prints command marketplace-update with the marketplace and message', () => {
    expect(renderCommand(run({ name: 'alpha', json: true }).output, { json: true }).stdout).toEqual(
      [
        '{"command":"marketplace-update","outcome":"ok","marketplace":"alpha","message":"Successfully updated marketplace: alpha"}',
      ],
    );
  });
});

describe('what the docs leave open', () => {
  test('a marketplace never added fails with exit 1 on stderr and failureCode not_found', () => {
    expect(text({ name: 'nowhere' })).toEqual({
      stdout: [],
      stderr: ["Marketplace 'nowhere' not found"],
      exitCode: 1,
    });
    const rendered = renderCommand(run({ name: 'nowhere', json: true }).output, { json: true });
    expect(JSON.parse(rendered.stdout.at(-1) ?? '')).toEqual({
      command: 'marketplace-update',
      outcome: 'failed',
      marketplace: 'nowhere',
      failureCode: 'not_found',
      message: "Marketplace 'nowhere' not found",
    });
  });

  test('a seed-managed marketplace named fails with exit 1 and failureCode seed_managed', () => {
    expect(text({ name: 'gamma' }).exitCode).toBe(1);
    const rendered = renderCommand(run({ name: 'gamma', json: true }).output, { json: true });
    expect(JSON.parse(rendered.stdout.at(-1) ?? '')).toMatchObject({
      outcome: 'failed',
      marketplace: 'gamma',
      failureCode: 'seed_managed',
    });
  });

  test('the seed-managed refusal tells the user to ask their administrator', () => {
    expect(text({ name: 'gamma' }).stderr[0]).toContain('administrator');
  });

  test('one marketplace reads Successfully updated 1 marketplace and none reads 0', () => {
    expect(text({}, { registered: [{ name: 'a' }] }).stdout).toEqual([
      'Successfully updated 1 marketplace',
    ]);
    expect(text({}, { registered: [] }).stdout).toEqual(['Successfully updated 0 marketplaces']);
  });
});
