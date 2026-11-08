/**
 * hooks.md § "SessionStart decision control", § "CwdChanged output", § "FileChanged output" and
 * § "MessageDisplay output". The consumers (the file watcher, the title, the skill rescan, the
 * renderer) are the host's and the kit cannot apply the fields; what is proven is that each is
 * accepted, typed, kept to the events and sources the docs name, and merged across hooks.
 */
import { describe, expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import { merged, specific } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const start = (fields: object) => specific('SessionStart', fields);
const startFacts = (source: string) => ({ source }) as const;

spec('hooks.output.SessionStart.additionalContext', () => {
  test("is added to Claude's context at the start of the conversation, from every hook", () => {
    const outcome = merged('SessionStart', [
      start({
        additionalContext: 'Current branch: feat/auth-refactor\nUncommitted changes: src/auth.ts',
      }),
      start({ additionalContext: 'second' }),
    ]);
    expect(outcome.additionalContext).toEqual([
      'Current branch: feat/auth-refactor\nUncommitted changes: src/auth.ts',
      'second',
    ]);
  });

  test("plain-text stdout reaches Claude's context too", () => {
    const outcome = merged('SessionStart', [
      { plain: { text: 'Active issue: #4211', as: 'context' } },
    ]);
    expect(outcome.additionalContext).toEqual(['Active issue: #4211']);
  });

  test('a SessionStart hook has no decision control: a block is dropped', () => {
    expect(merged('SessionStart', [{ decision: 'block', reason: 'x' }]).block).toBeUndefined();
  });
});

spec('hooks.output.SessionStart.initialUserMessage', () => {
  test('is the first user message of the session: handed on', () => {
    expect(
      merged('SessionStart', [start({ initialUserMessage: 'Fix the failing build' })]).effects
        .initialUserMessage,
    ).toBe('Fix the failing build');
  });

  test('judgment: of several hooks the last message wins; an empty one gives none', () => {
    const outcome = merged('SessionStart', [
      start({ initialUserMessage: 'one' }),
      start({ initialUserMessage: 'two' }),
      start({ initialUserMessage: '' }),
    ]);
    expect(outcome.effects.initialUserMessage).toBe('two');
  });

  test('a value of the wrong type fails validation', () => {
    expect(parseHookOutput('SessionStart', start({ initialUserMessage: 5 })).failure).toContain(
      'initialUserMessage',
    );
  });
});

spec('hooks.output.SessionStart.sessionTitle', () => {
  test.each(['startup', 'resume', 'fork'])('sets the title when source is %s', (source) => {
    expect(
      merged('SessionStart', [start({ sessionTitle: 'auth-refactor' })], startFacts(source)).effects
        .sessionTitle,
    ).toBe('auth-refactor');
  });

  test.each(['clear', 'compact'])('does not apply when source is %s', (source) => {
    expect(
      merged('SessionStart', [start({ sessionTitle: 'auth-refactor' })], startFacts(source)).effects
        .sessionTitle,
    ).toBeUndefined();
  });
});

spec('hooks.output.SessionStart.watchPaths', () => {
  test('are the absolute paths to watch for FileChanged events', () => {
    const outcome = merged('SessionStart', [
      start({ watchPaths: ['/work/app/.env', '/work/app/package.json'] }),
    ]);
    expect(outcome.effects.watchPaths).toEqual(['/work/app/.env', '/work/app/package.json']);
  });

  test('judgment: the lists of several hooks are joined once each, in order', () => {
    const outcome = merged('SessionStart', [
      start({ watchPaths: ['/a', '/b'] }),
      start({ watchPaths: ['/b', '/c'] }),
    ]);
    expect(outcome.effects.watchPaths).toEqual(['/a', '/b', '/c']);
  });

  test('no list is no effect; a list that is not an array of strings fails validation', () => {
    expect(merged('SessionStart', [start({})]).effects.watchPaths).toBeUndefined();
    expect(parseHookOutput('SessionStart', start({ watchPaths: '/a' })).failure).toContain(
      'watchPaths',
    );
    expect(parseHookOutput('SessionStart', start({ watchPaths: [1] })).failure).toContain(
      'watchPaths',
    );
  });
});

spec('hooks.output.SessionStart.reloadSkills', () => {
  test('true asks for a re-scan of the skill and command directories after the hooks complete', () => {
    expect(merged('SessionStart', [start({ reloadSkills: true })]).effects.reloadSkills).toBe(true);
  });

  test('false and absent do not; one hook that asks is enough', () => {
    expect(
      merged('SessionStart', [start({ reloadSkills: false })]).effects.reloadSkills,
    ).toBeUndefined();
    expect(
      merged('SessionStart', [start({}), start({ reloadSkills: true })]).effects.reloadSkills,
    ).toBe(true);
  });

  test('a value that is not a boolean fails validation', () => {
    expect(parseHookOutput('SessionStart', start({ reloadSkills: 'yes' })).failure).toContain(
      'reloadSkills',
    );
  });
});

const watchOf = (event: 'CwdChanged' | 'FileChanged', watchPaths: readonly string[]) =>
  specific(event, { watchPaths });

describe.each(['CwdChanged', 'FileChanged'] as const)('%s', (event) => {
  const watch = (watchPaths: readonly string[]) => watchOf(event, watchPaths);

  spec(`hooks.output.${event}.watchPaths`, () => {
    test('replaces the current dynamic watch list with the absolute paths', () => {
      expect(merged(event, [watch(['/work/app/.envrc'])]).effects.watchPaths).toEqual([
        '/work/app/.envrc',
      ]);
    });

    test('an empty array clears the dynamic list, which is not the same as returning nothing', () => {
      expect(merged(event, [watch([])]).effects.watchPaths).toEqual([]);
      expect(merged(event, [{}]).effects.watchPaths).toBeUndefined();
    });

    test('several hooks: their lists are joined once each (judgment)', () => {
      expect(merged(event, [watch(['/a']), watch(['/a', '/b'])]).effects.watchPaths).toEqual([
        '/a',
        '/b',
      ]);
    });

    test('systemMessage is read, continue is discarded, and there is no decision control', () => {
      const outcome = merged(event, [
        { systemMessage: 'watching', continue: false, decision: 'block', reason: 'x' },
      ]);
      expect(outcome.systemMessages).toEqual(['watching']);
      expect(outcome.continue).toBe(true);
      expect(outcome.block).toBeUndefined();
    });

    test('a list that is not an array of strings fails validation', () => {
      expect(parseHookOutput(event, specific(event, { watchPaths: '/a' })).failure).toContain(
        'watchPaths',
      );
    });
  });
});

const display = (displayContent: string) => specific('MessageDisplay', { displayContent });

spec('hooks.output.MessageDisplay.displayContent', () => {
  test('is the text displayed in place of the delta', () => {
    expect(merged('MessageDisplay', [display('plain text')]).effects.displayContent).toBe(
      'plain text',
    );
  });

  test('omitting it displays the original: no effect', () => {
    expect(merged('MessageDisplay', [{}]).effects.displayContent).toBeUndefined();
  });

  test('judgment: an empty string is a replacement, not an omission', () => {
    expect(merged('MessageDisplay', [display('')]).effects.displayContent).toBe('');
  });

  test('is display-only: nothing for the transcript or for Claude, no block', () => {
    const outcome = merged('MessageDisplay', [{ ...display('x'), decision: 'block', reason: 'r' }]);
    expect(outcome.block).toBeUndefined();
    expect(outcome.additionalContext).toEqual([]);
  });

  test('systemMessage and continue are discarded', () => {
    const outcome = merged('MessageDisplay', [
      { ...display('x'), systemMessage: 'warn', continue: false },
    ]);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.continue).toBe(true);
  });

  test('judgment: of several hooks the last replacement wins', () => {
    expect(merged('MessageDisplay', [display('a'), display('b')]).effects.displayContent).toBe('b');
  });

  test('a value that is not a string fails validation', () => {
    expect(
      parseHookOutput('MessageDisplay', specific('MessageDisplay', { displayContent: 4 })).failure,
    ).toContain('displayContent');
  });
});

describe('DirectoryAdded routes its systemMessage by source (hooks.md, "DirectoryAdded decision control")', () => {
  const say = { systemMessage: 'added /work/lib' };

  test('slash_command: it goes to Claude as context on the next turn, not to the user', () => {
    const outcome = merged('DirectoryAdded', [say], {
      directory: '/work/lib',
      source: 'slash_command',
    });
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.additionalContext).toEqual(['added /work/lib']);
  });

  test('register_repo_root: it is written to the debug log only', () => {
    const outcome = merged('DirectoryAdded', [say], {
      directory: '/work/lib',
      source: 'register_repo_root',
    });
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.additionalContext).toEqual([]);
  });

  test('continue is discarded, and there is no decision control', () => {
    const outcome = merged(
      'DirectoryAdded',
      [{ continue: false, decision: 'block', reason: 'x' }],
      {
        directory: '/work/lib',
        source: 'slash_command',
      },
    );
    expect(outcome.continue).toBe(true);
    expect(outcome.block).toBeUndefined();
  });
});
