/**
 * plugins/marketplace-reference.md § Copy mode and link mode (`link`: "fills the cache entry with a
 * link to each top-level entry of the printed directory"; "Keep the directory in place"). The
 * install plan of a link-mode plugin: the links, the directory that must stay, and what is refused.
 */
import { expect, test } from 'bun:test';
import { decideInstallMode } from '../../src/marketplace/install-mode.ts';
import { planInstallFinish, type InstallFinish } from '../../src/marketplace/install-plan.ts';
import type { InstalledRecords } from '../../src/marketplace/installed-plugins.ts';
import { copy } from '../support/install-finish.ts';
import { spec } from '../support/spec.ts';

const COPY_LINK = 'marketplace.rule.Copy mode and link mode';

spec(`${COPY_LINK}.link`, () => {
  test('the cache entry is filled with a link to each top-level entry of the printed directory', () => {
    const decided = decideInstallMode({
      origin: {
        kind: 'marketplace',
        source: { kind: 'command', command: 'tool path', timeoutSeconds: 60, mode: 'link' },
      },
      platform: 'posix',
    });
    if ('severity' in decided) throw new Error('expected a decision');
    const done = planInstallFinish(
      copy({
        decision: decided,
        sourceDirectory: '/opt/tool/out',
        topLevel: ['.claude-plugin', 'skills', 'node_modules'],
      }),
    );
    expect(done.destination).toBe('/p/cache/acme/formatter/1.0.0');
    expect(done.links).toEqual([
      { name: '.claude-plugin', target: '/opt/tool/out/.claude-plugin' },
      { name: 'skills', target: '/opt/tool/out/skills' },
      { name: 'node_modules', target: '/opt/tool/out/node_modules' },
    ]);
  });

  test('a copy has no links', () => {
    expect(planInstallFinish(copy({ topLevel: ['skills'] })).links).toEqual([]);
  });
});

const linkDecision = () => {
  const decided = decideInstallMode({
    origin: {
      kind: 'marketplace',
      source: { kind: 'command', command: 'tool path', timeoutSeconds: 60, mode: 'link' },
    },
    platform: 'posix',
  });
  if ('severity' in decided) throw new Error('expected a decision');
  return decided;
};

spec(`${COPY_LINK}.Keep the directory in place`, () => {
  test('the plan says the printed directory must stay where it is, and copies nothing out of it', () => {
    const done = planInstallFinish(
      copy({
        decision: linkDecision(),
        sourceDirectory: '/opt/tool/out',
        topLevel: ['skills', 'hooks'],
      }),
    );
    expect(done.mustStayAt).toBe('/opt/tool/out');
    expect(done.copy).toBe(false);
    expect(done.links.map((one) => one.target)).toEqual([
      '/opt/tool/out/skills',
      '/opt/tool/out/hooks',
    ]);
    expect(done.destination).toBe('/p/cache/acme/formatter/1.0.0');
  });

  test('a copy copies into the cache folder and needs no directory to stay', () => {
    const done = planInstallFinish(copy());
    expect(done.copy).toBe(true);
    expect(done.mustStayAt).toBeUndefined();
  });

  test('a plugin loaded in place copies nothing and names no directory to keep', () => {
    const decided = decideInstallMode({ origin: { kind: 'skills-directory' }, platform: 'posix' });
    if ('severity' in decided) throw new Error('expected a decision');
    const done = planInstallFinish(copy({ decision: decided, sourceDirectory: '/s/skills' }));
    expect(done.copy).toBe(false);
    expect(done.mustStayAt).toBeUndefined();
  });

  test.each(['a/b', '..', '.', '', '../x'])(
    'a top-level entry named %p cannot be a link in the cache entry and nothing is planned',
    (name) => {
      const existing: InstalledRecords = {};
      const done = planInstallFinish(
        copy({
          decision: linkDecision(),
          sourceDirectory: '/opt/tool/out',
          topLevel: ['skills', name],
          existing,
        }),
      );
      expect(done.links).toEqual([]);
      expect(done.record).toBeUndefined();
      expect(done.mustStayAt).toBeUndefined();
      expect(done.records).toBe(existing);
      expect(done.issues).toHaveLength(1);
    },
  );

  test('a name that merely contains dots is a legal entry', () => {
    const done = planInstallFinish(
      copy({
        decision: linkDecision(),
        sourceDirectory: '/opt/tool/out',
        topLevel: ['..hidden', 'a..b'],
      }),
    );
    expect(done.issues).toEqual([]);
    expect(done.links).toHaveLength(2);
  });
});

spec(`${COPY_LINK}.link`, () => {
  test.each([
    ['no printed directory', { topLevel: ['skills'] }],
    ['no top-level entries', { sourceDirectory: '/opt/tool/out' }],
    ['an empty list of entries', { sourceDirectory: '/opt/tool/out', topLevel: [] }],
  ] satisfies [string, Partial<InstallFinish>][])(
    'a link-mode plugin with %s is not planned: its cache entry would be empty',
    (_, rest) => {
      const existing: InstalledRecords = {};
      const done = planInstallFinish(copy({ decision: linkDecision(), existing, ...rest }));
      expect(done.destination).toBeUndefined();
      expect(done.record).toBeUndefined();
      expect(done.records).toBe(existing);
      expect(done.issues.map((one) => one.message)).toEqual([
        'A link-mode plugin needs the printed directory and its top-level entries',
      ]);
    },
  );
});
