/**
 * plugins/troubleshooting.md § Plugin installed but not working: the `installed_plugins.json` notes
 * (`holds a record under "<id>"` and `holds records under`, the `Note:` of `claude plugin list`, the
 * refusals of `claude plugin install`, `uninstall` and `update` and `failureCode:
 * "install_records_unreadable"` of `--json`, the format this version does not know, `could not be
 * read and was rebuilt`, `install records under names that no version ... were removed`). Quoted
 * texts are asserted verbatim; the options after the record text, and the words around the quoted
 * heading of the two dated-copy notes, are rows in spec/judgments.md.
 */
import { expect, test } from 'bun:test';
import { parseInstalledPlugins } from '../../src/marketplace/installed-plugins.ts';
import {
  listNote,
  rebuiltNote,
  recoveryNotes,
  refuseForUnreadableRecords,
  refusalResultLine,
  setAsideNote,
  unknownFormatMessage,
  unreadableRecordsMessage,
} from '../../src/marketplace/install-messages.ts';
import { createStoreLayout } from '../../src/marketplace/store-layout.ts';
import { spec } from '../support/spec.ts';

const RECORD =
  'install.troubleshooting.installed_plugins.json holds a record under "<id>" that this version of Claude Code cannot read';

spec(RECORD, () => {
  test('names the id and that this version cannot read it', () => {
    expect(unreadableRecordsMessage(['new@acme'])).toStartWith(
      'installed_plugins.json holds a record under "new@acme" that this version of Claude Code cannot read',
    );
  });

  test('carries the three options in order: update, uninstall with the writer, delete by hand', () => {
    const text = unreadableRecordsMessage(['new@acme']);
    const update = text.indexOf('claude update');
    const uninstall = text.indexOf(
      'uninstall the plugin with the version of Claude Code that wrote',
    );
    const byHand = text.indexOf('delete the record from installed_plugins.json by hand');
    expect(update).toBeGreaterThan(0);
    expect(uninstall).toBeGreaterThan(update);
    expect(byHand).toBeGreaterThan(uninstall);
    expect(text).toContain('restart Claude Code or run /reload-plugins');
  });

  test('a whole file in a format this version does not know says so instead', () => {
    expect(unknownFormatMessage(3)).toBe(
      'installed_plugins.json is in a format (version 3) that this version of Claude Code does not know',
    );
  });
});

spec(`${RECORD}.Several such records`, () => {
  test('the message reads "holds records under" and names each id', () => {
    expect(unreadableRecordsMessage(['a@acme', 'b@acme'])).toStartWith(
      'installed_plugins.json holds records under "a@acme", "b@acme" that this version of Claude Code cannot read',
    );
  });
});

spec(`${RECORD}.claude plugin list`, () => {
  test('prints the message that reading a record this version cannot read produces, as a Note:', () => {
    const read = parseInstalledPlugins(
      JSON.stringify({ version: 2, plugins: { 'new@acme': [{ scope: 'galaxy' }] } }),
    );
    const message = read.issues[0]?.message ?? '';
    expect(listNote(message)).toStartWith(
      'Note: installed_plugins.json holds a record under "new@acme" that this version of Claude Code cannot read. ',
    );
  });
});

spec(`${RECORD}.--json on any of those three commands`, () => {
  test.each([
    ['install', 'installed'],
    ['uninstall', 'uninstalled'],
    ['update', 'updated'],
  ] as const)(
    '%s refuses with `Plugin "<name>" was not %s:` and the same text, and --json carries it',
    (command, word) => {
      const reason = unreadableRecordsMessage(['new@acme']);
      const refusal = refuseForUnreadableRecords(command, 'formatter', reason);
      expect(refusal.message).toBe(`Plugin "formatter" was not ${word}: ${reason}`);
      expect(JSON.parse(refusalResultLine(command, refusal))).toEqual({
        command,
        outcome: 'failed',
        message: `Plugin "formatter" was not ${word}: ${reason}`,
        failureCode: 'install_records_unreadable',
      });
    },
  );

  test('the result is one object on one line', () => {
    const refusal = refuseForUnreadableRecords('install', 'f', unreadableRecordsMessage(['a@b']));
    expect(refusalResultLine('install', refusal)).not.toContain('\n');
  });
});

const layout = createStoreLayout('/p', (base, rel) => `${base}/${rel}`);
const UNREADABLE = 'installed_plugins.unreadable.2026-11-08.ab12.kept';
const SET_ASIDE = 'installed_plugins.set-aside.2026-11-08.ab12.json';

spec('install.troubleshooting.installed_plugins.json could not be read and was rebuilt', () => {
  test('the note names the kept file, for as long as it sits beside installed_plugins.json', () => {
    expect(recoveryNotes(['installed_plugins.json', UNREADABLE], layout)).toEqual([
      rebuiltNote(`/p/${UNREADABLE}`),
    ]);
    expect(rebuiltNote(`/p/${UNREADABLE}`)).toContain(
      'installed_plugins.json could not be read and was rebuilt',
    );
    expect(rebuiltNote(`/p/${UNREADABLE}`)).toContain(`/p/${UNREADABLE}`);
    expect(recoveryNotes(['installed_plugins.json'], layout)).toEqual([]);
  });
});

spec(
  'install.troubleshooting.install records under names that no version of Claude Code can use were removed from installed_plugins.json',
  () => {
    test('the note names the copy and ends "Nothing needs doing about these copies."', () => {
      const note = setAsideNote(`/p/${SET_ASIDE}`);
      expect(note).toContain(
        'install records under names that no version of Claude Code can use were removed from installed_plugins.json',
      );
      expect(note).toContain(`/p/${SET_ASIDE}`);
      expect(note.endsWith('Nothing needs doing about these copies.')).toBe(true);
      expect(recoveryNotes([SET_ASIDE], layout)).toEqual([note]);
    });

    test('both copies give both notes; unrelated files give none', () => {
      expect(
        recoveryNotes([SET_ASIDE, 'known_marketplaces.json', UNREADABLE], layout),
      ).toHaveLength(2);
    });
  },
);
