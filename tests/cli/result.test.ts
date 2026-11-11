/**
 * plugins/cli-reference.md § JSON result format (`command`, `outcome` and `message` are always
 * present, the other fields only when they apply, a usage error prints no result line and exits `1`
 * with the reason on stderr), § JSON result for marketplace commands (`command` is
 * `marketplace-add`, `marketplace-remove` or `marketplace-update`; `marketplace` and `failureCode`
 * appear only when they apply; the reserved name `anthropic-plugin-directory` can print no result
 * line) and § claude plugin commands (exit codes `0` and `1`, and `2` for `validate`). The stream a
 * human line goes to, and the exit code of a refusal that prints no result line, are outside
 * `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  commandFailed,
  marketplaceFailure,
  marketplaceSuccess,
  noResultLine,
  renderCommand,
  commandSucceeded,
  unexpectedError,
  usageError,
} from '../../src/cli/result.ts';
import { spec } from '../support/spec.ts';

const lastLine = (lines: readonly string[]): Record<string, unknown> =>
  JSON.parse(lines.at(-1) ?? 'null');

describe('the human line', () => {
  test('a success prints its message on stdout and exits 0', () => {
    const rendered = renderCommand(
      commandSucceeded('install', 'Successfully installed plugin: a@m'),
      {
        json: false,
      },
    );
    expect(rendered).toEqual({
      stdout: ['Successfully installed plugin: a@m'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('a failure prints its message on stderr and exits 1', () => {
    const rendered = renderCommand(commandFailed('install', 'Aborted.'), { json: false });
    expect(rendered).toEqual({ stdout: [], stderr: ['Aborted.'], exitCode: 1 });
  });
});

spec('cli.plugin.JSON result format.command', () => {
  test('the last stdout line is one object whose command names the subcommand that ran', () => {
    const rendered = renderCommand(
      commandSucceeded('install', 'Successfully installed plugin: a@m'),
      {
        json: true,
      },
    );
    expect(lastLine(rendered.stdout).command).toBe('install');
  });

  test('anything printed before the result stays above it: only the last line is parsed', () => {
    const rendered = renderCommand(commandSucceeded('install', 'ok'), {
      json: true,
      before: ['Run: ./setup.sh'],
    });
    expect(rendered.stdout).toHaveLength(2);
    expect(rendered.stdout[0]).toBe('Run: ./setup.sh');
    expect(lastLine(rendered.stdout).command).toBe('install');
  });
});

spec('cli.plugin.JSON result format.outcome', () => {
  test('outcome is ok for a success and failed for a failure, matching the exit code', () => {
    const ok = renderCommand(commandSucceeded('uninstall', 'done'), { json: true });
    const bad = renderCommand(commandFailed('uninstall', 'nope'), { json: true });
    expect([lastLine(ok.stdout).outcome, ok.exitCode]).toEqual(['ok', 0]);
    expect([lastLine(bad.stdout).outcome, bad.exitCode]).toEqual(['failed', 1]);
  });

  test('a failure with --json prints its result on stdout, not stderr', () => {
    const bad = renderCommand(commandFailed('install', 'nope', { failureCode: 'x' }), {
      json: true,
    });
    expect(bad.stderr).toEqual([]);
  });
});

spec('cli.plugin.JSON result format.message', () => {
  test('message is the human-readable line the command would print without --json', () => {
    const result = commandFailed('install', 'Aborted — the command was not run.');
    const json = lastLine(renderCommand(result, { json: true }).stdout);
    const human = renderCommand(result, { json: false });
    expect(json.message).toBe('Aborted — the command was not run.');
    expect(human.stderr).toEqual(['Aborted — the command was not run.']);
  });

  test('the other fields appear only when they apply', () => {
    expect(
      lastLine(renderCommand(commandSucceeded('install', 'ok'), { json: true }).stdout),
    ).toEqual({
      command: 'install',
      outcome: 'ok',
      message: 'ok',
    });
    const withCode = commandFailed('uninstall', 'still on', {
      failureCode: 'settings_still_on',
      fields: { pluginId: 'a@m', scope: 'project' },
    });
    expect(lastLine(renderCommand(withCode, { json: true }).stdout)).toEqual({
      command: 'uninstall',
      outcome: 'failed',
      pluginId: 'a@m',
      scope: 'project',
      failureCode: 'settings_still_on',
      message: 'still on',
    });
  });
});

describe('a usage error', () => {
  spec('cli.plugin.JSON result format.outcome', () => {
    test('prints no result line, exits 1 and gives the reason on stderr, with or without --json', () => {
      for (const json of [false, true]) {
        const rendered = renderCommand(usageError('Invalid scope: team'), { json });
        expect(rendered).toEqual({ stdout: [], stderr: ['Invalid scope: team'], exitCode: 1 });
      }
    });
  });
});

describe('what the docs leave open', () => {
  test('a key of fields named command, outcome or message is dropped for the reserved key', () => {
    const output = commandSucceeded('install', 'the message', {
      fields: { command: 'x', outcome: 'failed', message: 'y', scope: 'user' },
    });
    expect(lastLine(renderCommand(output, { json: true }).stdout)).toEqual({
      command: 'install',
      outcome: 'ok',
      scope: 'user',
      message: 'the message',
    });
  });
});

describe('exit codes', () => {
  test('an unexpected error exits 2 with the reason on stderr and no result line (validate only)', () => {
    expect(renderCommand(unexpectedError('boom'), { json: true })).toEqual({
      stdout: [],
      stderr: ['boom'],
      exitCode: 2,
    });
  });
});

spec('cli.plugin.JSON result for marketplace commands', () => {
  test('the remove example of the docs, field for field', () => {
    const result = marketplaceSuccess(
      'marketplace-remove',
      'your-marketplace',
      'Successfully removed marketplace: your-marketplace',
    );
    const rendered = renderCommand(result, { json: true });
    expect(rendered.stdout).toEqual([
      '{"command":"marketplace-remove","outcome":"ok","marketplace":"your-marketplace","message":"Successfully removed marketplace: your-marketplace"}',
    ]);
  });

  test('a failure carries failureCode, and marketplace only when a marketplace was acted on', () => {
    const named = marketplaceFailure('marketplace-add', 'x', 'bad', 'invalid_source');
    expect(lastLine(renderCommand(named, { json: true }).stdout)).toEqual({
      command: 'marketplace-add',
      outcome: 'failed',
      marketplace: 'x',
      failureCode: 'invalid_source',
      message: 'bad',
    });
    const unnamed = marketplaceFailure('marketplace-add', undefined, 'bad', 'invalid_source');
    expect('marketplace' in lastLine(renderCommand(unnamed, { json: true }).stdout)).toBe(false);
  });

  test('the reserved name anthropic-plugin-directory can print no result line, so the exit code is what to check', () => {
    const rendered = renderCommand(noResultLine('The name is reserved'), { json: true });
    expect(rendered.stdout).toEqual([]);
    expect(rendered.exitCode).toBe(1);
  });
});
