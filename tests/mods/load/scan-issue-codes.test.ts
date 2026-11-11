/**
 * Every issue of a hooks module scan carries one code of `MOD_SCAN_ISSUE_CODES`, so a host tells them
 * apart without reading the words (plugins/mods/create.md § Check what Claude Code reads from your
 * mod: the rules a scan refuses; the messages are proven in tests/mods/load/scan*.test.ts). The
 * codes are the kit's: judgment `scanIssueCodes` (spec/judgments.md), so no `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  MOD_SCAN_ISSUE_CODES,
  scanHooksModule,
  type ModScanIssueCode,
} from '../../../src/mods/load/scan/index.ts';

const inRegister = (body: string) => `export function register(on) {\n${body}\n}`;
const hook = (body: string) =>
  inRegister(`on('session.start', async ($, e, next) => { ${body}; return next(e) })`);
const deep = `export function register(on) {}\nfunction f() ${'{'.repeat(2001)}${'}'.repeat(2001)}`;

const CASES: {
  readonly [C in ModScanIssueCode]: { readonly source: string; readonly declared?: true };
} = {
  syntax: { source: 'export function register(on) {' },
  'too-deep': { source: deep },
  'no-register': { source: 'export const x = 1' },
  'dynamic-import': { source: `${inRegister('')}\nimport('./x.js')` },
  require: { source: `${inRegister('')}\nrequire('fs')` },
  'import-outside': { source: `import { a } from '../../outside.js'\n${inRegister('')}` },
  'import-package': { source: `import fs from 'node:fs'\n${inRegister('')}` },
  'state-unreadable': {
    source: `import { atom } from 'claude-code'\nlet count = atom({ plugin: 'p', key: 'k' }, 0)\n${inRegister('')}`,
  },
  'state-undeclared': {
    source: `import { atom } from 'claude-code'\nconst count = atom({ plugin: 'p', key: 'k' }, 0)\n${inRegister('')}`,
    declared: true,
  },
  'client-props': { source: hook('h(Client, props)') },
  'client-module': { source: hook("h(Client, { module: 'board.tsx' })") },
  'event-not-literal': { source: inRegister('on(name, async ($, e, next) => next(e))') },
  'unknown-event': { source: inRegister("on('no.such', async ($, e, next) => next(e))") },
  'missing-filter': { source: inRegister("on('telemetry.log', async ($, e, next) => next(e))") },
  'hook-unreadable': { source: inRegister("on('session.start', handler)") },
  'on-shadowed': { source: inRegister('{ const on = 1 }') },
  'dollar-escapes': { source: hook('helper.run($)') },
  'dollar-as-value': { source: hook('const x = $') },
};

describe('MOD_SCAN_ISSUE_CODES', () => {
  for (const code of MOD_SCAN_ISSUE_CODES) {
    test(`${code}: the scan reports it, and only codes of the list`, () => {
      const { source, declared } = CASES[code];
      const scan = scanHooksModule(source, 'register.js', {
        isEntry: true,
        ...(declared ? { declaredState: new Set<string>() } : {}),
      });
      expect(scan.issues.map((issue) => issue.code)).toContain(code);
      for (const issue of scan.issues) {
        expect(MOD_SCAN_ISSUE_CODES).toContain(issue.code);
        expect(issue.message.startsWith('register.js: ')).toBe(true);
      }
    });
  }
});
