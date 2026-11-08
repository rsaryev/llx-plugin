/**
 * plugins/loading.md § Name conflicts, § Hooks when two enabled plugins share a name, § Keep a
 * session-only plugin from loading. The `/plugin` row wording the docs do not quote (a skills-directory
 * copy shadowed by an installed plugin or another skills directory, the synced copy's note, the
 * hooks note's tail) is the kit's, tested last outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  afterDisabling,
  hookConflictNotes,
  nameHolder,
  resolveNameConflict,
  sessionOnlyOffEntry,
  type HookCopy,
  type NameCandidate,
} from '../../src/marketplace/name-conflicts.ts';
import { spec } from '../support/spec.ts';

const L = 'install.loading.';
const copy = (
  origin: NameCandidate['origin'],
  extra: Partial<NameCandidate> = {},
): NameCandidate => ({
  id: `hello-plugin@${origin}`,
  name: 'hello-plugin',
  origin,
  enabled: true,
  ...extra,
});
const loads = (candidates: readonly NameCandidate[]): string[] =>
  resolveNameConflict(candidates)
    .filter((verdict) => verdict.loads)
    .map((verdict) => verdict.id);
const verdictOf = (candidates: readonly NameCandidate[], id: string) =>
  resolveNameConflict(candidates).find((verdict) => verdict.id === id);

spec(
  [`${L}Name conflicts`, 'policy.org.Require a marketplace and its plugins.--plugin-dir copies'],
  () => {
    test('the order is managed, session-only, installed, skills-directory, synced', () => {
      const all = [
        copy('synced'),
        copy('skills-dir'),
        copy('installed'),
        copy('session-only'),
        copy('installed', { id: 'hello-plugin@managed', managedLocked: true }),
      ];
      expect(loads(all)).toEqual(['hello-plugin@managed']);
      expect(loads(all.slice(0, 4))).toEqual(['hello-plugin@session-only']);
      expect(loads(all.slice(0, 3))).toEqual(['hello-plugin@installed']);
      expect(loads(all.slice(0, 2))).toEqual(['hello-plugin@skills-dir']);
      expect(loads(all.slice(0, 1))).toEqual(['hello-plugin@synced']);
    });
    test('a managed-locked id keeps a --plugin-dir copy out with the quoted message, whether it is true or false', () => {
      for (const enabled of [true, false]) {
        const managed = copy('installed', {
          id: 'hello-plugin@acme',
          managedLocked: true,
          enabled,
        });
        expect(verdictOf([managed, copy('session-only')], 'hello-plugin@session-only')).toEqual({
          id: 'hello-plugin@session-only',
          loads: false,
          note: '--plugin-dir copy of "hello-plugin" ignored: plugin is locked by managed settings',
        });
      }
    });
    test('a session-only plugin replaces an installed one silently; only the debug log records it', () => {
      const verdict = verdictOf(
        [copy('installed'), copy('session-only')],
        'hello-plugin@installed',
      );
      expect(verdict).toEqual({
        id: 'hello-plugin@installed',
        loads: false,
        debugLog: 'Plugin "hello-plugin" from --plugin-dir overrides installed version',
      });
      expect(verdict).not.toHaveProperty('note');
    });
    test('it replaces a skills-directory plugin with the quoted Errors tab row', () => {
      expect(
        verdictOf([copy('skills-dir'), copy('session-only')], 'hello-plugin@skills-dir')?.note,
      ).toBe(
        'Not loaded — the name "hello-plugin" is already taken by a session-only plugin (--plugin-dir / --plugin-url), which takes precedence',
      );
    });
    test('the order compares manifest names, so ids differ freely', () => {
      const inline = copy('session-only', { id: 'hello-plugin@inline' });
      const installed = copy('installed', { id: 'hello@example-marketplace' });
      expect(loads([installed, inline])).toEqual(['hello-plugin@inline']);
    });
    test('between two skills-directory plugins the user one loads and the project one is dropped with a row naming the path', () => {
      const user = copy('skills-dir', {
        id: 'a@skills-dir',
        skillsDir: { scope: 'user', path: '~/.claude/skills/hello-plugin' },
      });
      const project = copy('skills-dir', {
        id: 'b@skills-dir',
        skillsDir: { scope: 'project', path: '.claude/skills/hello-plugin' },
      });
      expect(loads([project, user])).toEqual(['a@skills-dir']);
      expect(verdictOf([project, user], 'b@skills-dir')?.note).toContain(
        '~/.claude/skills/hello-plugin',
      );
    });
    test('a synced copy is not loaded when an enabled plugin from any other origin matches; disabling your own copy lets it load', () => {
      const synced = copy('synced');
      expect(verdictOf([synced, copy('installed')], 'hello-plugin@synced')?.loads).toBe(false);
      expect(loads([synced, copy('installed', { enabled: false })])).toEqual([
        'hello-plugin@synced',
      ]);
    });
    test('a skills-directory copy is not loaded under an installed plugin, and the row names it', () => {
      const verdict = verdictOf([copy('skills-dir'), copy('installed')], 'hello-plugin@skills-dir');
      expect(verdict?.loads).toBe(false);
      expect(verdict?.note).toContain('hello-plugin@installed');
    });
  },
);

spec(`${L}Keep a session-only plugin from loading`, () => {
  test('the entry is the id with @inline set to false', () => {
    expect(sessionOnlyOffEntry('hello-plugin')).toEqual({ 'hello-plugin@inline': false });
  });
  test('a disabled session-only plugin does not shadow: the marketplace or skills-directory copy loads', () => {
    const off = copy('session-only', { id: 'hello-plugin@inline', enabled: false });
    expect(loads([off, copy('installed')])).toEqual(['hello-plugin@installed']);
    expect(loads([off, copy('skills-dir')])).toEqual(['hello-plugin@skills-dir']);
    expect(verdictOf([off, copy('installed')], 'hello-plugin@installed')).toEqual({
      id: 'hello-plugin@installed',
      loads: true,
    });
  });
});

const hooks = (id: string, loadOrder: number, extra: Partial<HookCopy> = {}): HookCopy => ({
  id,
  loadOrder,
  managedEnabled: false,
  hooksJson: true,
  hooksModule: false,
  ...extra,
});

spec(`${L}Hooks when two enabled plugins share a name`, () => {
  test('without a managed copy, the copy Claude Code loads first holds the name', () => {
    expect(nameHolder([hooks('a@m2', 2), hooks('a@m1', 1)])?.id).toBe('a@m1');
  });
  test('a copy managed settings turn on holds the name', () => {
    expect(nameHolder([hooks('a@m1', 1), hooks('a@m2', 2, { managedEnabled: true })])?.id).toBe(
      'a@m2',
    );
  });
  test('the left-out copy gets a note that begins "Its hooks.json hooks do not run" and names the holder', () => {
    const [note, ...rest] = hookConflictNotes([hooks('a@m1', 1), hooks('a@m2', 2)]);
    expect(rest).toEqual([]);
    expect(note?.id).toBe('a@m2');
    expect(note?.message).toStartWith('Its hooks.json hooks do not run');
    expect(note?.message).toContain('a@m1');
  });
  test('for a hooks module the note begins "Its hooks module does not load"', () => {
    const module = { hooksJson: false, hooksModule: true };
    const [note] = hookConflictNotes([hooks('a@m1', 1, module), hooks('a@m2', 2, module)]);
    expect(note?.message).toStartWith('Its hooks module does not load');
  });
  test('one plugin per name registers hooks.json hooks and one loads a hooks module, so a copy with both gets both notes', () => {
    const both = { hooksJson: true, hooksModule: true };
    expect(
      hookConflictNotes([hooks('a@m1', 1, both), hooks('a@m2', 2, both)]).map((n) => n.kind),
    ).toEqual(['hooks.json', 'hooks module']);
  });
  test('disabling the holder and reloading registers the other copy and clears the note', () => {
    const copies = [hooks('a@m1', 1), hooks('a@m2', 2)];
    expect(afterDisabling(copies, 'a@m1')).toEqual({ allowed: true, notes: [] });
  });
  test('the holder managed settings turn on cannot be disabled, so the other copy stays off', () => {
    const copies = [hooks('a@m1', 1), hooks('a@m2', 2, { managedEnabled: true })];
    const result = afterDisabling(copies, 'a@m2');
    expect(result.allowed).toBe(false);
    expect(result.notes.map((n) => n.id)).toEqual(['a@m1']);
  });
});

describe('judgments: conflicts', () => {
  test('a name with one copy loads it, and a plugin with no enabled copy loads nothing', () => {
    expect(loads([copy('installed')])).toEqual(['hello-plugin@installed']);
    expect(loads([copy('installed', { enabled: false })])).toEqual([]);
  });
});
