/**
 * settings-reference.md § `env`: "How `env` values interact with your shell" and "When Claude Code
 * applies `env` values"; the judgments of spec/judgments.md on trust and on the scopes that carry
 * the block (the `env` row of the key table decides).
 */
import { describe, expect, test } from 'bun:test';
import { applySettingsEnv } from '../../../src/settings/index.ts';
import {
  envLayer as layer,
  envValues as names,
  resolveEnvOf as resolve,
} from '../../support/settings-env.ts';
import { spec } from '../../support/spec.ts';

spec('settings.reference.How env values interact with your shell', () => {
  test('a session started by Claude Desktop or a self-hosted runner keeps the launch environment: a file value for a variable it sets is ignored', () => {
    const result = resolve([layer('user', { A: 'file', B: 'file' })], {
      environment: { A: 'launch' },
      launchOwnsEnvironment: true,
    });
    expect(result.values).toEqual({ B: 'file' });
    expect(result.ignored).toEqual([{ name: 'A', scope: 'user', why: 'launch-environment' }]);
  });

  test('an empty value cancels a shell export, and the subprocess inherits the empty value', () => {
    const values = names([layer('user', { CLAUDE_CODE_USE_VERTEX: '' })]);
    expect(applySettingsEnv({ CLAUDE_CODE_USE_VERTEX: '1' }, values, false)).toEqual({
      CLAUDE_CODE_USE_VERTEX: '',
    });
  });

  test('when several files set a variable the highest-precedence one applies', () => {
    expect(
      names([layer('user', { A: 'u' }), layer('flag', { A: 'f' }), layer('local', { A: 'l' })]),
    ).toEqual({
      A: 'f',
    });
  });

  test('otherwise the shell value is replaced by the file', () => {
    expect(names([layer('user', { A: 'file' })], { environment: { A: 'shell' } })).toEqual({
      A: 'file',
    });
  });
});

spec('settings.reference.When Claude Code applies env values', () => {
  test('user, --settings and managed settings apply without trust; project and local settings after the workspace is trusted', () => {
    const files = [
      layer('user', { U: '1' }),
      layer('flag', { F: '1' }),
      layer('managed', { M: '1' }),
      layer('project', { P: '1' }),
      layer('local', { L: '1' }),
    ];
    expect(names(files, { isFolderTrusted: () => false })).toEqual({
      U: '1',
      F: '1',
      M: '1',
    });
    expect(names(files, { isFolderTrusted: () => true })).toEqual({
      U: '1',
      F: '1',
      M: '1',
      P: '1',
      L: '1',
    });
  });

  test('a saved change that alters the merged env is a new resolution the host applies again; a removed variable stays in the running session', () => {
    const before = names([layer('user', { A: '1', B: '2' })]);
    const after = names([layer('user', { A: '9' })]);
    const running = applySettingsEnv(applySettingsEnv({}, before, false), after, false);
    expect(running).toEqual({ A: '9', B: '2' });
  });

  test("after /cd the new directory's project and local values go on top of the previous directory's, once its trust is answered", () => {
    const trust = new Map([
      ['/first', true],
      ['/second', false],
    ]);
    const asked: string[] = [];
    const resolveIn = (folder: string, files: ReturnType<typeof layer>[]) =>
      resolve(files, {
        isFolderTrusted: (scope) => {
          asked.push(`${folder}:${scope}`);
          return trust.get(folder) === true;
        },
      });
    const first = resolveIn('/first', [layer('project', { A: 'first', ONLY_FIRST: '1' })]).values;
    const running = applySettingsEnv({}, first, false);
    const files = [layer('project', { A: 'second' }), layer('local', { L: '1' })];

    expect(resolveIn('/second', files).values).toEqual({});
    expect(asked).toContain('/second:project');
    expect(asked).toContain('/second:local');

    trust.set('/second', true);
    expect(applySettingsEnv(running, resolveIn('/second', files).values, false)).toEqual({
      A: 'second',
      ONLY_FIRST: '1',
      L: '1',
    });
  });
});

describe('judgment: untrusted files wait for trust', () => {
  test('a model selection or a timeout of an untrusted project file is not applied: the docs name no safe list', () => {
    const files = [layer('project', { ANTHROPIC_MODEL: 'sonnet', API_TIMEOUT_MS: '5' })];
    expect(names(files, { isFolderTrusted: () => false })).toEqual({});
  });
});

describe('judgment: which scopes carry env', () => {
  test('an --add-dir directory contributes no variable; parent settings do, as the env row of the key table says', () => {
    expect(names([layer('parent', { A: '1' }), layer('addDir', { B: '1' })])).toEqual({ A: '1' });
  });

  test('a layer with no env block adds nothing', () => {
    expect(names([{ scope: 'user', settings: {} }])).toEqual({});
  });
});
