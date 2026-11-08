/**
 * permissions.md § Read-only commands: the prompt cases the docs give for `docker`, `file`, `ps`,
 * network (UNC) paths on Windows and writes to special shell variables, asserted through `decide()`
 * in Manual mode, where "commands from this set still prompt in these cases".
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, pathsWith } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const RUNS = allow('read-only-command');
const PROMPTS = ask('default-prompt');

const windows = pathsWith({
  platform: 'windows',
  cwd: 'C:\\work\\app',
  primaryWorkingDirectory: 'C:\\work\\app',
  home: 'C:\\Users\\alice',
});

spec('permissions.mode.default', () => {
  describe('"`ps` that could print environment variables"', () => {
    test('`ps aux` and `ps -ef` run without a prompt', () => {
      expect(bash('default', 'ps aux')).toEqual(RUNS);
      expect(bash('default', 'ps -ef')).toEqual(RUNS);
    });

    test('an argument that could act as the `e` option prompts', () => {
      expect(bash('default', 'ps auxe')).toEqual(PROMPTS);
      expect(bash('default', 'ps aux -e')).toEqual(PROMPTS);
      expect(bash('default', 'ps e')).toEqual(PROMPTS);
    });
  });

  spec(['permissions.behavior.Read-only commands.file with path-opening flags'], () => {
    describe('"`file` with path-opening flags"', () => {
      test('`file` runs, and prompts with `-m`, `--magic-file`, `-f` or `--files-from`', () => {
        expect(bash('default', 'file README.md')).toEqual(RUNS);
        expect(bash('default', 'file -b README.md')).toEqual(RUNS);
        for (const flags of ['-m magic', '--magic-file=magic', '-f list', '--files-from list']) {
          expect(bash('default', `file ${flags} README.md`)).toEqual(PROMPTS);
        }
      });
    });
  });

  spec(['permissions.behavior.Read-only commands.docker pointed at another daemon'], () => {
    describe('"`docker` pointed at another daemon"', () => {
      test('a read-only form runs against the local daemon', () => {
        expect(bash('default', 'docker ps')).toEqual(RUNS);
        expect(bash('default', 'docker images')).toEqual(RUNS);
      });

      test('a flag that selects a different daemon prompts, Podman`s `--url` and `--connection` too', () => {
        for (const flags of ['-H tcp://host:2375', '--context remote', '--host=tcp://h']) {
          expect(bash('default', `docker ${flags} ps`)).toEqual(PROMPTS);
        }
        expect(bash('default', 'podman --url ssh://host ps')).toEqual(PROMPTS);
        expect(bash('default', 'podman --connection remote ps')).toEqual(PROMPTS);
      });

      test('a form that changes state is not read-only', () => {
        expect(bash('default', 'docker run alpine')).toEqual(PROMPTS);
        expect(bash('default', 'docker rm web')).toEqual(PROMPTS);
      });
    });
  });

  spec(['permissions.behavior.Read-only commands.Network paths on Windows'], () => {
    describe('"Network paths on Windows"', () => {
      test('a command whose arguments include a UNC path prompts', () => {
        expect(bash('default', 'ls \\\\server\\share\\file', { match: windows })).toEqual(PROMPTS);
        expect(bash('default', 'ls .\\src', { match: windows })).toEqual(RUNS);
      });

      test('the same text is an ordinary argument on a POSIX host', () => {
        expect(bash('default', 'ls //server/share')).toEqual(RUNS);
      });
    });
  });

  spec(['permissions.behavior.Read-only commands.Writes to special shell variables'], () => {
    describe('"Writes to special shell variables"', () => {
      test('a loop over a special variable prompts even though every command in its body is read-only', () => {
        expect(bash('default', 'for IFS in a b; do ls; done')).toEqual(PROMPTS);
        expect(bash('default', 'for PATH in /tmp; do ls; done')).toEqual(PROMPTS);
      });

      test('a loop over an ordinary variable runs, which tells the two apart', () => {
        expect(bash('default', 'for name in a b; do ls; done')).toEqual(RUNS);
      });

      test('an unset of a special variable prompts', () => {
        expect(bash('default', 'unset PATH; ls')).toEqual(PROMPTS);
        expect(bash('default', 'ls; unset -v IFS')).toEqual(PROMPTS);
      });

      test('an assignment or export of one prompts, as a prefix or on its own', () => {
        expect(bash('default', 'PATH=/tmp ls')).toEqual(PROMPTS);
        expect(bash('default', 'IFS=: ls')).toEqual(PROMPTS);
        expect(bash('default', 'export PATH=/tmp; ls')).toEqual(PROMPTS);
        expect(bash('default', 'ls; IFS=,')).toEqual(PROMPTS);
      });

      test('a read of a special variable does not prompt', () => {
        expect(bash('default', 'echo $PATH')).toEqual(RUNS);
      });
    });
  });
});

describe('judgment: a command that sets any variable is not in the read-only set', () => {
  test('LANG=C ls prompts, as the kit reads the read-only set stricter than acceptEdits', () => {
    expect(bash('default', 'LANG=C ls')).toEqual(PROMPTS);
  });

  test('`cd -` goes to a directory the kit cannot know, so it is not read-only', () => {
    expect(bash('default', 'cd -')).toEqual(PROMPTS);
    expect(bash('default', 'cd')).toEqual(PROMPTS);
  });
});
