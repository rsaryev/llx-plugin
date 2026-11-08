/**
 * plugins/cli-reference.md § plugin update: `-y, --yes` "Accept a changed install command from a
 * command-source plugin, without the prompt. Required when stdin or stdout isn't a TTY, unless you
 * pass `--accept-command`"; `--accept-command <sha256>` "Accept the marketplace-declared command whose
 * `sha256` a previous `--json` run reported in `shownCommand`, in place of `-y`. Can't be combined with
 * `-y`"; plugins/host-marketplace.md § How users accept a headersHelper command ("each time they
 * install or update that one plugin by itself"), § Change the command of a command source (an update
 * asks only when the command or mode changed). These flags have no requirement ids of their own: the
 * tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { PROMPT } from '../../src/cli/command-acceptance.ts';
import { install, outputOf, shown, update } from '../support/update.ts';

const declared = { command: 'node build.js', mode: 'copy' as const };

const sourced = (accepted = declared) =>
  install(
    'hooked@m',
    { installed: '1.0.0', offered: '1.1.0' },
    { command: { declared, accepted } },
  );

const run = (extra = {}, tty = false) =>
  update({ installs: [sourced()], args: { plugin: 'hooked@m', ...extra }, facts: { tty } });

describe('a command source whose command did not change', () => {
  test('updates without a question', async () => {
    const found = await run();
    expect('update' in found).toBe(true);
    expect(shown(found).exitCode).toBe(0);
  });
});

describe('a command source whose command changed', () => {
  const changed = sourced({ command: 'node old.js', mode: 'copy' });
  const go = (extra = {}, tty = false, facts = {}) =>
    update({
      installs: [changed],
      args: { plugin: 'hooked@m', ...extra },
      facts: { tty, ...facts },
    });

  test('without a terminal and without -y is refused with the command displayed', async () => {
    const found = await go();
    expect('update' in found).toBe(false);
    expect(shown(found)).toMatchObject({
      stdout: expect.arrayContaining(['node build.js']),
      exitCode: 1,
    });
  });

  test('-y accepts it', async () => {
    expect('update' in (await go({ yes: true }))).toBe(true);
  });

  test('-y is ignored inside a Claude Code session', async () => {
    expect('update' in (await go({ yes: true }, false, { session: true }))).toBe(false);
  });

  test('at a terminal the user is asked', async () => {
    const found = await go({}, true);
    expect(found).toMatchObject({ prompt: PROMPT });
    expect('update' in (await go({}, true, { answer: true }))).toBe(true);
    expect('update' in (await go({}, true, { answer: false }))).toBe(false);
  });

  test('--accept-command with the displayed sha256 accepts it in place of -y', async () => {
    const first = await go({ json: true });
    const out = JSON.parse(shown(first, true).stdout.at(-1) ?? '');
    const sha256 = out.shownCommand.sha256;
    expect('update' in (await go({ acceptCommand: sha256 }))).toBe(true);
    expect('update' in (await go({ acceptCommand: 'f'.repeat(64) }))).toBe(false);
  });

  test('--accept-command cannot be combined with -y', async () => {
    const found = await go({ yes: true, acceptCommand: 'a'.repeat(64) });
    expect(outputOf(found)).toMatchObject({ kind: 'usage-error' });
  });
});

describe('a headersHelper entry', () => {
  test('is shown on every update, even when nothing about it changed', async () => {
    const found = await update({
      installs: [
        install(
          'helped@m',
          { installed: '1.0.0', offered: '1.1.0' },
          { headersHelper: '/opt/mint.sh' },
        ),
      ],
      args: { plugin: 'helped@m' },
    });
    expect('update' in found).toBe(false);
    expect(shown(found).stderr[0]).toBe('Aborted — the command was not run.');
  });
});
