/**
 * tools-reference.md § Bash tool behavior ("Timeout and output limits", "Output limits",
 * "Background commands", "Time limit for background commands", "Raise the time limit for
 * background commands"), env-vars.md (BASH_DEFAULT_TIMEOUT_MS, BASH_MAX_TIMEOUT_MS,
 * BASH_MAX_OUTPUT_LENGTH), settings-reference.md § bashOutputMaxChars and hooks.md § Bash
 * (`timeout`: "Values above the maximum are reduced to the maximum rather than rejected").
 * Pure arithmetic and classification over the numbers the docs give; running the process and
 * writing the output file are the host's. Where the docs are silent (an invalid variable, a
 * non-positive timeout, how a compound line exits, the head and tail split) the rule is a
 * judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  backgroundTimeLimit,
  bashOutputLimits,
  classifyBashExit,
  effectiveBashTimeout,
  windowBashOutput,
} from '../../src/rules/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const env = (record: Record<string, string> = {}) => fakeEnvironment(record);

spec('tools.input.Bash.timeout', () => {
  test('without a timeout the command runs for the default: two minutes out of the box', () => {
    expect(effectiveBashTimeout(undefined, env())).toBe(120_000);
  });

  test('the hooks.md example, 120000, is used as sent', () => {
    expect(effectiveBashTimeout(120_000, env())).toBe(120_000);
    expect(effectiveBashTimeout(5_000, env())).toBe(5_000);
  });

  test('"Values above the maximum are reduced to the maximum rather than rejected": ten minutes out of the box', () => {
    expect(effectiveBashTimeout(600_000, env())).toBe(600_000);
    expect(effectiveBashTimeout(600_001, env())).toBe(600_000);
    expect(effectiveBashTimeout(86_400_000, env())).toBe(600_000);
  });

  test('BASH_DEFAULT_TIMEOUT_MS is "the default when Claude passes no timeout"', () => {
    const set = env({ BASH_DEFAULT_TIMEOUT_MS: '300000' });
    expect(effectiveBashTimeout(undefined, set)).toBe(300_000);
    expect(effectiveBashTimeout(45_000, set)).toBe(45_000);
  });

  test('BASH_MAX_TIMEOUT_MS sets the ceiling that caps whatever Claude requests', () => {
    const set = env({ BASH_MAX_TIMEOUT_MS: '1800000' });
    expect(effectiveBashTimeout(undefined, set)).toBe(120_000);
    expect(effectiveBashTimeout(1_500_000, set)).toBe(1_500_000);
    expect(effectiveBashTimeout(9_000_000, set)).toBe(1_800_000);
    const lower = env({ BASH_MAX_TIMEOUT_MS: '60000' });
    expect(effectiveBashTimeout(300_000, lower)).toBe(120_000);
  });

  test('"the effective ceiling is the larger of the two": a default above the maximum raises the ceiling', () => {
    const set = env({ BASH_DEFAULT_TIMEOUT_MS: '900000', BASH_MAX_TIMEOUT_MS: '700000' });
    expect(effectiveBashTimeout(undefined, set)).toBe(900_000);
    expect(effectiveBashTimeout(2_000_000, set)).toBe(900_000);
    expect(effectiveBashTimeout(800_000, set)).toBe(800_000);
  });
});

spec('tools.input.Bash.timeout', () => {
  const unattended = { unattended: true, printWithTextPrompt: false };

  test('a local session has no time limit on background commands', () => {
    const local = { unattended: false, printWithTextPrompt: false };
    expect(backgroundTimeLimit({ session: local, env: env(), timeout: 60_000 })).toBeUndefined();
    expect(backgroundTimeLimit({ session: local, env: env(), moved: true })).toBeUndefined();
  });

  test('an unattended command started in the background gets 30 minutes, or the timeout it passes up to 2 hours', () => {
    expect(backgroundTimeLimit({ session: unattended, env: env() })).toBe(1_800_000);
    expect(backgroundTimeLimit({ session: unattended, env: env(), timeout: 3_600_000 })).toBe(
      3_600_000,
    );
    expect(backgroundTimeLimit({ session: unattended, env: env(), timeout: 9_000_000 })).toBe(
      7_200_000,
    );
  });

  test('a foreground command that moves to the background gets 30 minutes from the move, whatever its timeout', () => {
    expect(
      backgroundTimeLimit({ session: unattended, env: env(), timeout: 60_000, moved: true }),
    ).toBe(1_800_000);
  });

  test('a `-p` run with a text prompt has 10 minutes instead of 30', () => {
    const print = { unattended: true, printWithTextPrompt: true };
    expect(backgroundTimeLimit({ session: print, env: env() })).toBe(600_000);
    expect(backgroundTimeLimit({ session: print, env: env(), moved: true })).toBe(600_000);
  });

  test('BASH_DEFAULT_TIMEOUT_MS above the default replaces it; a lower value leaves it', () => {
    expect(
      backgroundTimeLimit({
        session: unattended,
        env: env({ BASH_DEFAULT_TIMEOUT_MS: '3000000' }),
      }),
    ).toBe(3_000_000);
    expect(
      backgroundTimeLimit({
        session: unattended,
        env: env({ BASH_DEFAULT_TIMEOUT_MS: '900000' }),
      }),
    ).toBe(1_800_000);
    const print = { unattended: true, printWithTextPrompt: true };
    expect(
      backgroundTimeLimit({ session: print, env: env({ BASH_DEFAULT_TIMEOUT_MS: '700000' }) }),
    ).toBe(700_000);
    expect(
      backgroundTimeLimit({ session: print, env: env({ BASH_DEFAULT_TIMEOUT_MS: '300000' }) }),
    ).toBe(600_000);
  });

  test('BASH_MAX_TIMEOUT_MS above 2 hours raises the maximum; so does a default above it', () => {
    const raised = env({ BASH_MAX_TIMEOUT_MS: '10800000' });
    expect(backgroundTimeLimit({ session: unattended, env: raised, timeout: 9_000_000 })).toBe(
      9_000_000,
    );
    expect(backgroundTimeLimit({ session: unattended, env: raised, timeout: 20_000_000 })).toBe(
      10_800_000,
    );
    const byDefault = env({ BASH_DEFAULT_TIMEOUT_MS: '8000000' });
    expect(backgroundTimeLimit({ session: unattended, env: byDefault, timeout: 9_000_000 })).toBe(
      8_000_000,
    );
    const lower = env({ BASH_MAX_TIMEOUT_MS: '1000000' });
    expect(backgroundTimeLimit({ session: unattended, env: lower, timeout: 9_000_000 })).toBe(
      7_200_000,
    );
  });
});

const BENIGN = ['grep x f', 'rg x', 'egrep x f', 'fgrep x f', 'find . -name x', 'diff a b'];
const BENIGN_MORE = ['test -f x', '[ -f x ]', 'git diff', 'git grep x'];

describe('valid and failed results', () => {
  spec('tools.tool.Bash', () => {
    test('exit 0 is valid and a command that exits with another status is a failure', () => {
      expect(classifyBashExit('npm test', 0)).toBe(true);
      expect(classifyBashExit('npm test', 2)).toBe(false);
      expect(classifyBashExit('grep x f', 2)).toBe(false);
      expect(classifyBashExit('grep x f', 127)).toBe(false);
    });

    test('exit 1 is valid for grep, rg, egrep, fgrep, find, diff, test, [, git diff and git grep', () => {
      for (const command of [...BENIGN, ...BENIGN_MORE]) {
        expect(classifyBashExit(command, 1)).toBe(true);
      }
    });

    test('"Every other command that exits 1 counts as a failure": pgrep, jq -e, cmp, git status, npm test', () => {
      for (const command of [
        'pgrep node',
        'jq -e .x f.json',
        'cmp a b',
        'git status',
        'npm test',
      ]) {
        expect(classifyBashExit(command, 1)).toBe(false);
      }
    });

    test('git is benign only for diff and grep, not for log or commit', () => {
      expect(classifyBashExit('git log', 1)).toBe(false);
      expect(classifyBashExit('git commit -m x', 1)).toBe(false);
    });

    test('a different command is not mistaken for a benign one by its prefix', () => {
      expect(classifyBashExit('grepx a', 1)).toBe(false);
      expect(classifyBashExit('testing', 1)).toBe(false);
      expect(classifyBashExit('git diffstat', 1)).toBe(false);
    });
  });
});

const text = (length: number) => 'x'.repeat(length);
const withSetting = (chars: number, record: Record<string, string> = {}) =>
  bashOutputLimits(env(record), chars);

describe('output windows', () => {
  spec('tools.tool.Bash', () => {
    test('the inline ceiling is 30,000 characters and the read-back window 30,000, ceiling 150,000', () => {
      expect(bashOutputLimits(env())).toEqual({ inline: 30_000, readBack: 30_000 });
      const raised = bashOutputLimits(env({ BASH_MAX_OUTPUT_LENGTH: '100000' }));
      expect(raised.readBack).toBe(100_000);
      expect(bashOutputLimits(env({ BASH_MAX_OUTPUT_LENGTH: '900000' })).readBack).toBe(150_000);
    });

    test('BASH_MAX_OUTPUT_LENGTH "doesn\'t raise the inline ceilings"', () => {
      const limits = bashOutputLimits(env({ BASH_MAX_OUTPUT_LENGTH: '100000' }));
      expect(limits.inline).toBe(30_000);
      const result = windowBashOutput({ output: text(50_000), valid: true, limits });
      expect(result.savedToFile).toBe(true);
    });

    test('bashOutputMaxChars sizes the inline ceiling and the window together, clamped to 4000 to 128000, and wins over the variable', () => {
      expect(withSetting(100_000)).toEqual({ inline: 100_000, readBack: 100_000 });
      expect(withSetting(1_000)).toEqual({ inline: 4_000, readBack: 4_000 });
      expect(withSetting(500_000)).toEqual({ inline: 128_000, readBack: 128_000 });
      expect(withSetting(60_000, { BASH_MAX_OUTPUT_LENGTH: '140000' })).toEqual({
        inline: 60_000,
        readBack: 60_000,
      });
    });

    test('a valid result within the ceiling arrives whole', () => {
      const result = windowBashOutput({
        output: text(30_000),
        valid: true,
        limits: bashOutputLimits(env()),
      });
      expect(result.text).toHaveLength(30_000);
      expect(result.savedToFile).toBe(false);
    });

    test('a valid result over the ceiling is saved to a file and Claude gets a preview of the first 2,000 characters', () => {
      const output = `${'a'.repeat(2_000)}${'b'.repeat(40_000)}`;
      const result = windowBashOutput({ output, valid: true, limits: bashOutputLimits(env()) });
      expect(result.savedToFile).toBe(true);
      expect(result.text).toBe('a'.repeat(2_000));
    });

    test('a failure arrives whole up to 10,000 characters', () => {
      const result = windowBashOutput({
        output: text(10_000),
        valid: false,
        limits: bashOutputLimits(env()),
      });
      expect(result.text).toHaveLength(10_000);
      expect(result.savedToFile).toBe(false);
    });

    test('a longer failure is a head-and-tail excerpt of 10,000 characters, cut from the read-back window, with no file path', () => {
      const output = `${'H'.repeat(5_000)}${'m'.repeat(40_000)}${'T'.repeat(5_000)}`;
      const limits = bashOutputLimits(env({ BASH_MAX_OUTPUT_LENGTH: '60000' }));
      const result = windowBashOutput({ output, valid: false, limits });
      expect(result.savedToFile).toBe(false);
      expect(result.text).toHaveLength(10_000);
      expect(result.text.startsWith('H'.repeat(5_000))).toBe(true);
      expect(result.text.endsWith('T'.repeat(5_000))).toBe(true);
    });

    test('the excerpt of a failure is cut from the window, not from the whole output', () => {
      const output = `${'a'.repeat(30_000)}${'END'.repeat(1_000)}`;
      const result = windowBashOutput({ output, valid: false, limits: bashOutputLimits(env()) });
      expect(result.text).not.toContain('END');
    });
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in the Bash tool', () => {
  test('a timeout that is not a positive number, and a variable that is not a positive integer, are ignored', () => {
    expect(effectiveBashTimeout(0, env())).toBe(120_000);
    expect(effectiveBashTimeout(-5, env())).toBe(120_000);
    expect(effectiveBashTimeout(Number.NaN, env())).toBe(120_000);
    expect(effectiveBashTimeout('90000', env())).toBe(120_000);
    const junk = env({ BASH_DEFAULT_TIMEOUT_MS: 'soon', BASH_MAX_TIMEOUT_MS: '-1' });
    expect(effectiveBashTimeout(undefined, junk)).toBe(120_000);
    expect(effectiveBashTimeout(10_000_000, junk)).toBe(600_000);
  });

  test('a compound line exits with its last command: cat f | grep x is benign, grep x f | wc -l is not', () => {
    expect(classifyBashExit('cat f | grep x', 1)).toBe(true);
    expect(classifyBashExit('grep x f | wc -l', 1)).toBe(false);
    expect(classifyBashExit('cd src && grep x f', 1)).toBe(true);
    expect(classifyBashExit('grep x f && echo found', 1)).toBe(false);
    expect(classifyBashExit('grep x f;', 1)).toBe(true);
    expect(classifyBashExit('grep x $(cmd)', 1)).toBe(true);
  });

  test('a command behind a wrapper or with git options is read as written, so it is a failure', () => {
    expect(classifyBashExit('sudo grep x f', 1)).toBe(false);
    expect(classifyBashExit('git -C . diff', 1)).toBe(false);
  });

  test('a failure excerpt is half head and half tail', () => {
    const output = `${'1'.repeat(15_000)}${'2'.repeat(15_000)}`;
    const result = windowBashOutput({ output, valid: false, limits: bashOutputLimits(env()) });
    expect(result.text).toBe(`${'1'.repeat(5_000)}${'2'.repeat(5_000)}`);
  });

  test('a variable below the inline ceiling shrinks it too: nothing larger than the window was read', () => {
    const limits = bashOutputLimits(env({ BASH_MAX_OUTPUT_LENGTH: '10000' }));
    expect(limits).toEqual({ inline: 10_000, readBack: 10_000 });
  });
});
