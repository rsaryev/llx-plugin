/**
 * `terminalSequence`: hooks.md § "JSON output" (the field row) and § "Emit terminal notifications"
 * (the allowlist, "Sequences may be terminated with BEL or with ST", the rejected kinds, the
 * `printf` example). Whether Claude Code writes it (only in an interactive session, never for a
 * command `WorktreeCreate` hook) is the host's: the kit proves which values it hands over.
 */
import { describe, expect, test } from 'bun:test';
import { allowedTerminalSequence, parseHookOutput } from '../../../src/hooks/index.ts';
import { merged } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const ESC = '\u001b';
const BEL = '\u0007';
const ST = `${ESC}\\`;
const osc = (code: string, text: string, end = BEL) => `${ESC}]${code};${text}${end}`;

spec(['hooks.output.common.terminalSequence', 'hooks.output.JSON.terminalSequence'], () => {
  test.each([
    ['0', 'window title'],
    ['1', 'icon title'],
    ['2', 'window and icon title'],
    ['9', 'iTerm2 notification'],
    ['99', 'Kitty notification'],
    ['777', 'urxvt, Ghostty and Warp notification'],
  ])('OSC %s (%s) passes, ended by BEL or by ST', (code) => {
    expect(allowedTerminalSequence(osc(code, 'hello'))).toBe(osc(code, 'hello'));
    expect(allowedTerminalSequence(osc(code, 'hello', ST))).toBe(osc(code, 'hello', ST));
  });

  test('the documented example, built with printf, passes', () => {
    const sequence = `${ESC}]777;notify;Claude Code;Needs your attention${BEL}`;
    expect(merged('Notification', [{ terminalSequence: sequence }]).terminalSequences).toEqual([
      sequence,
    ]);
  });

  test('a bare BEL passes, and so does taskbar progress, OSC 9;4', () => {
    expect(allowedTerminalSequence(BEL)).toBe(BEL);
    expect(allowedTerminalSequence(osc('9', '4;1;50'))).toBe(osc('9', '4;1;50'));
  });

  test('"one or more allowlisted escape sequences": a run of them passes whole', () => {
    const run = osc('2', 'title') + BEL + osc('9', 'done');
    expect(allowedTerminalSequence(run)).toBe(run);
  });

  test.each([
    ['CSI cursor and color sequences', `${ESC}[31mred${ESC}[0m`],
    ['an OSC palette sequence', osc('4', '1;rgb:ff/00/00')],
    ['an OSC 8 hyperlink', osc('8', ';https://example.com')],
    ['an OSC 52 clipboard write', osc('52', 'c;aGVsbG8=')],
    ['OSC 1337', osc('1337', 'SetUserVar=a=b')],
    ['plain text', 'hello'],
    ['an allowed sequence followed by text', `${osc('9', 'ok')}tail`],
    ['an allowed sequence followed by a CSI', `${osc('9', 'ok')}${ESC}[2J`],
    ['an OSC left unterminated', `${ESC}]9;never ends`],
    ['an OSC that smuggles an escape into its text', `${ESC}]9;a${ESC}[2Jb${BEL}`],
    ['an OSC with no number', `${ESC}]${BEL}`],
    ['an OSC number that only starts like an allowed one', osc('90', 'x')],
    ['text that starts with a C1 control instead of an ESC', `\u009b31m`],
    ['an empty value', ''],
  ])('%s: the field is ignored', (_name, value) => {
    expect(allowedTerminalSequence(value)).toBeUndefined();
    const outcome = merged('Notification', [{ terminalSequence: value }]);
    expect(outcome.terminalSequences).toEqual([]);
  });

  test('a value outside the allowlist is reported, naming the allowlist', () => {
    const outcome = merged('Notification', [{ terminalSequence: `${ESC}[2J` }]);
    expect(outcome.issues).toHaveLength(1);
    expect(outcome.issues[0]?.message).toContain('allowlist');
  });

  test('every hook that returns a valid one has it emitted, in registry order', () => {
    const outcome = merged('Notification', [
      { terminalSequence: BEL },
      { terminalSequence: 'plain' },
      { terminalSequence: osc('2', 'T') },
    ]);
    expect(outcome.terminalSequences).toEqual([BEL, osc('2', 'T')]);
  });

  test('it works on events that discard systemMessage and continue, such as StopFailure', () => {
    expect(
      merged('StopFailure', [{ terminalSequence: BEL, continue: false }]).terminalSequences,
    ).toEqual([BEL]);
  });

  test('a wrong type fails validation', () => {
    expect(parseHookOutput('Notification', { terminalSequence: 7 }).failure).toContain(
      'terminalSequence',
    );
  });
});

describe('terminalSequence on the events that discard their JSON (judgment)', () => {
  test('Setup, SessionEnd and WorktreeRemove still emit it: "the field works on events that discard systemMessage and continue"', () => {
    for (const event of ['Setup', 'SessionEnd', 'WorktreeRemove'] as const) {
      expect(merged(event, [{ terminalSequence: BEL }]).terminalSequences).toEqual([BEL]);
    }
  });
});

describe('judgment: control characters inside an OSC body', () => {
  test.each([
    ['a C1 control', `${ESC}]9;a\u009bb${BEL}`],
    ['a newline', `${ESC}]9;a\nb${BEL}`],
    ['a C0 control', `${ESC}]9;a\u0001b${BEL}`],
    ['a DEL', `${ESC}]9;a\u007fb${BEL}`],
  ])('%s inside an allowed OSC body: the field is ignored', (_name, value) => {
    expect(allowedTerminalSequence(value)).toBeUndefined();
  });

  test('the same body without the control character passes', () => {
    expect(allowedTerminalSequence(osc('9', 'ab'))).toBe(osc('9', 'ab'));
  });
});
