/**
 * hooks.md § Persisted variables in PowerShell commands (env-vars.md, `CLAUDE_ENV_FILE`: "PowerShell
 * commands receive its variables too"): the line grammar, the debug message, Windows paths, the sandbox.
 */
import { describe, expect, test } from 'bun:test';
import { createEnvFiles, readPowershellVariables } from '../../../src/hooks/index.ts';
import { ENV_SESSION, memoryEnvFiles } from '../../support/env-files.ts';
import { spec } from '../../support/spec.ts';
import { NOT_PLAIN_ASSIGNMENTS } from '../../../src/hooks/env-file/powershell-reader.ts';

const signal = new AbortController().signal;
const posix = { windows: false };
const windows = { windows: true };
const variables = (text: string, options = posix) =>
  readPowershellVariables(text, options).variables;

spec('environment.host.CLAUDE_ENV_FILE', () => {
  describe('PowerShell commands receive the assignments, never the file run', () => {
    test('from every file the session wrote and the script named at launch, in that order, a later assignment winning', async () => {
      const store = memoryEnvFiles({
        '/home/me/venv.sh': 'export VIRTUAL_ENV=venv\nexport NODE_ENV=development\n',
        '/session/sess-1/session-env.sh': 'export NODE_ENV=production\nexport DEBUG_LOG=true\n',
        '/session/sess-1/cwd-env.sh': 'declare -x DIRENV=on\n',
      });
      const files = createEnvFiles(store, {
        sessionId: ENV_SESSION,
        launchScript: '/home/me/venv.sh',
      });
      const received = await files.powershellVariables(
        { windows: false, sandboxed: false },
        signal,
      );
      expect(received.variables).toEqual({
        VIRTUAL_ENV: 'venv',
        NODE_ENV: 'production',
        DEBUG_LOG: 'true',
        DIRENV: 'on',
      });
      expect(received.issues).toEqual([]);
    });

    test('a file that does not exist adds nothing', async () => {
      const files = createEnvFiles(memoryEnvFiles({ '/session/sess-1/cwd-env.sh': 'A=1\n' }), {
        sessionId: ENV_SESSION,
      });
      expect(
        (await files.powershellVariables({ windows: false, sandboxed: false }, signal)).variables,
      ).toEqual({
        A: '1',
      });
    });

    test('a line of another kind in any file means none from all of them, and the debug message is reported', async () => {
      const store = memoryEnvFiles({
        '/session/sess-1/session-env.sh': 'export A=1\n',
        '/session/sess-1/cwd-env.sh': 'export PATH="$PATH:./node_modules/.bin"\n',
      });
      const received = await createEnvFiles(store, { sessionId: ENV_SESSION }).powershellVariables(
        { windows: false, sandboxed: false },
        signal,
      );
      expect(received.variables).toEqual({});
      expect(received.issues.map((issue) => issue.message)).toEqual([
        'Session environment is not all plain assignments',
      ]);
    });

    test('a sandboxed PowerShell command receives none of the variables', async () => {
      const store = memoryEnvFiles({ '/session/sess-1/session-env.sh': 'export A=1\n' });
      const received = await createEnvFiles(store, { sessionId: ENV_SESSION }).powershellVariables(
        { windows: false, sandboxed: true },
        signal,
      );
      expect(received).toEqual({ variables: {}, issues: [] });
    });

    test('the grammar: a blank line, a # comment, then export NAME=value, declare -x NAME=value and NAME=value', () => {
      expect(
        variables(
          ['', '# the environment', 'export A=1', 'declare -x B=2', 'C=3', '   ', 'D='].join('\n'),
        ),
      ).toEqual({ A: '1', B: '2', C: '3', D: '' });
    });

    test('a value mixes unquoted text, single-quoted text and double-quoted text', () => {
      expect(variables('export P=/usr/local/bin:/opt/x_y-z@1%2+3=,.')).toEqual({
        P: '/usr/local/bin:/opt/x_y-z@1%2+3=,.',
      });
      expect(variables('export Q=\'a b $HOME `x` "y"\'')).toEqual({ Q: 'a b $HOME `x` "y"' });
      expect(variables('export R="a b"')).toEqual({ R: 'a b' });
      expect(variables(`export S=pre'mid dle'"end ing"post`)).toEqual({
        S: 'premid dleend ingpost',
      });
    });

    test('in double quotes a $, a backtick and a " are plain only when escaped with a backslash, and the value is what Bash would use', () => {
      expect(variables('export A="cost \\$5 and \\`tick\\` and \\"quote\\""')).toEqual({
        A: 'cost $5 and `tick` and "quote"',
      });
      expect(variables('export B="back\\\\slash"')).toEqual({ B: 'back\\slash' });
    });

    test("anything else is not plain: the docs' own examples and the other Bash spellings", () => {
      const notPlain = [
        'export PATH="$PATH:./node_modules/.bin"',
        'source ~/.nvm/nvm.sh',
        "export X=$'tab\\there'",
        'export A=1 B=2',
        'export A',
        'export A=$HOME',
        'export A=a b',
        'A=1 # trailing',
        'A=`id`',
        'A=$(id)',
        'A=*.ts',
        'A=~/x',
        '  A=1',
        'export A="unterminated',
        'export A="x"y"',
        'cd /tmp',
        '1BAD=1',
        'A-B=1',
        'export -n A=1',
      ];
      for (const line of notPlain) {
        const read = readPowershellVariables(`export OK=1\n${line}\n`, posix);
        expect(read.variables).toEqual({});
        expect(read.issues.map((issue) => issue.message)).toEqual([NOT_PLAIN_ASSIGNMENTS]);
      }
    });

    test('on Windows a variable whose value contains / or \\ is not received, the others are', () => {
      const text =
        "export NODE_ENV=production\nexport HOME_DIR='C:\\Users\\me'\nexport BIN=/usr/bin\nexport MIX=a/b\n";
      expect(variables(text, windows)).toEqual({ NODE_ENV: 'production' });
      expect(variables(text, posix)).toEqual({
        NODE_ENV: 'production',
        HOME_DIR: 'C:\\Users\\me',
        BIN: '/usr/bin',
        MIX: 'a/b',
      });
    });

    test('a value with a slash on Windows is not a reason to receive none: only that variable is left out', () => {
      const read = readPowershellVariables('A=x/y\nB=1\n', windows);
      expect(read.variables).toEqual({ B: '1' });
      expect(read.issues).toEqual([]);
    });
  });
});

describe('judgment: the grammar where the docs are silent', () => {
  test('a comment may be indented, a blank line may hold spaces, and a repeated name takes its last value', () => {
    expect(variables('  # note\n\t\nA=1\nA=2\n')).toEqual({ A: '2' });
  });

  test('in double quotes a backslash before another character stays a literal backslash, as in Bash', () => {
    expect(variables('A="C:\\Users\\me"')).toEqual({ A: 'C:\\Users\\me' });
  });

  test('export takes any run of spaces or tabs before the name', () => {
    expect(variables('export\tA=1\nexport   B=2\nexport \t C=3')).toEqual({
      A: '1',
      B: '2',
      C: '3',
    });
  });

  test('declare -x takes exactly one space between the words, then any run of spaces or tabs', () => {
    expect(variables('declare -x A=1\ndeclare -x \tB=2')).toEqual({ A: '1', B: '2' });
    expect(variables('declare\t-x A=1')).toEqual({});
    expect(variables('declare  -x A=1')).toEqual({});
  });

  test('a carriage return ends no line: a CRLF file is not plain', () => {
    expect(variables('A=1\r\n')).toEqual({});
  });

  test('a name that would shadow Object.prototype stays a name', () => {
    expect(Object.keys(variables('__proto__=x'))).toEqual(['__proto__']);
  });
});
