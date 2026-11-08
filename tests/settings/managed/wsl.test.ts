/**
 * settings-reference.md, `wslInheritsWindowsSettings`; managed-settings.md § When an admin document
 * counts as present, § How Claude Code combines managed sources (the fourth source).
 */
import { describe, expect, test } from 'bun:test';
import {
  composeManaged,
  readAdminDocument,
  wslChain,
} from '../../../src/settings/managed/index.ts';
import { document } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

describe('wslInheritsWindowsSettings', () => {
  const doc = (source: 'hklm' | 'file' | 'hkcu', settings: unknown) => document(source, settings);

  spec('policy.key.wslInheritsWindowsSettings', () => {
    test('off, WSL reads only /etc/claude-code', () => {
      const chain = wslChain({
        hklm: doc('hklm', { model: 'win' }),
        etcFile: doc('file', { model: 'etc' }),
      });
      expect(chain.chainOn).toBe(false);
      expect(chain.documents.map((d) => d.settings.model)).toEqual(['etc']);
    });

    test('on in HKLM, the Windows documents stand above /etc/claude-code and HKCU below it', () => {
      const chain = wslChain({
        hklm: doc('hklm', { wslInheritsWindowsSettings: true, model: 'win' }),
        windowsFile: doc('file', { cleanupPeriodDays: 3 }),
        etcFile: doc('file', { model: 'etc' }),
        hkcu: doc('hkcu', { wslInheritsWindowsSettings: true, model: 'user' }),
      });
      expect(chain.chainOn).toBe(true);
      expect(chain.documents.map((d) => d.settings.model ?? d.settings.cleanupPeriodDays)).toEqual([
        'win',
        3,
        'user',
      ]);
    });

    test('/etc/claude-code is read only when no Windows admin document is present', () => {
      const none = wslChain({
        hklm: doc('hklm', { wslInheritsWindowsSettings: true }),
        etcFile: doc('file', { model: 'etc' }),
      });
      expect(none.documents.map((d) => d.settings.model)).toEqual([undefined, 'etc']);
      const present = wslChain({
        windowsFile: doc('file', { wslInheritsWindowsSettings: true, model: 'win' }),
        etcFile: doc('file', { model: 'etc' }),
      });
      expect(present.documents.map((d) => d.settings.model)).toEqual(['win']);
    });

    test('honored only in the HKLM key or a file under C:\\Program Files\\ClaudeCode, not in /etc or HKCU', () => {
      const fromEtc = wslChain({
        etcFile: doc('file', { wslInheritsWindowsSettings: true, model: 'etc' }),
        hkcu: doc('hkcu', { wslInheritsWindowsSettings: true, model: 'user' }),
      });
      expect(fromEtc.chainOn).toBe(false);
      expect(fromEtc.documents.map((d) => d.settings.model)).toEqual(['etc']);
    });

    test('HKCU joins the chain only when it also sets the key to true', () => {
      const on = { wslInheritsWindowsSettings: true };
      const joins = wslChain({
        hklm: doc('hklm', { ...on, model: 'win' }),
        hkcu: doc('hkcu', { ...on, cleanupPeriodDays: 5 }),
      });
      expect(joins.documents.map((d) => d.source)).toEqual(['hklm', 'hkcu']);
      const stays = wslChain({
        hklm: doc('hklm', { ...on, model: 'win' }),
        hkcu: doc('hkcu', { cleanupPeriodDays: 5 }),
      });
      expect(stays.documents.map((d) => d.source)).toEqual(['hklm']);
    });

    test('HKCU alone cannot turn the chain on', () => {
      const chain = wslChain({
        hkcu: doc('hkcu', { wslInheritsWindowsSettings: true, model: 'user' }),
        etcFile: doc('file', { model: 'etc' }),
      });
      expect(chain.chainOn).toBe(false);
      expect(chain.documents.map((d) => d.settings.model)).toEqual(['etc']);
    });

    test('true and false are read with or without quotes, and null removes the key', () => {
      const chainOf = (value: unknown) =>
        wslChain({ hklm: doc('hklm', { wslInheritsWindowsSettings: value, model: 'win' }) })
          .chainOn;
      expect(chainOf('true')).toBe(true);
      expect(chainOf(true)).toBe(true);
      expect(chainOf('false')).toBe(false);
      expect(chainOf(false)).toBe(false);
      expect(chainOf(null)).toBe(false);
    });

    test('a Windows source holding only this key does not count as a policy source', () => {
      const composed = composeManaged(
        wslChain({
          hklm: doc('hklm', { wslInheritsWindowsSettings: true }),
          etcFile: doc('file', { model: 'etc' }),
        }).documents,
      );
      expect(composed.layer.settings.model).toBe('etc');
    });

    test('any other value counts as a present admin document with the chain on, and warns naming the key', () => {
      const chain = wslChain({
        hklm: doc('hklm', { wslInheritsWindowsSettings: 'maybe' }),
        etcFile: doc('file', { model: 'etc' }),
        hkcu: doc('hkcu', { wslInheritsWindowsSettings: true, model: 'user' }),
      });
      expect(chain.chainOn).toBe(true);
      expect(chain.documents.map((d) => d.settings.model)).not.toContain('etc');
      // Neither /etc/claude-code nor HKCU applies once the composition counts the document as present.
      expect(composeManaged(chain.documents).used).toEqual([]);
      expect(chain.issues[0]?.message).toContain('wslInheritsWindowsSettings');
    });

    test('an HKLM value or Windows file that exists but cannot be read keeps /etc/claude-code from applying, chain on or off', () => {
      for (const flag of [true, false]) {
        const chain = wslChain({
          hklm: readAdminDocument('hklm', { unreadable: 'denied' }),
          windowsFile: doc('file', { wslInheritsWindowsSettings: flag }),
          etcFile: doc('file', { model: 'etc' }),
        });
        expect(chain.documents.map((d) => d.settings.model)).not.toContain('etc');
      }
    });
  });
});
