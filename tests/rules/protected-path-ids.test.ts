/**
 * permission-modes.md § Protected paths ("Protected directories", "Protected files" and the
 * per-mode table). One `spec(...)` block per path or mode the section names: a write to it is
 * `protected-path` in acceptEdits mode (where an ordinary write is approved), and the same write
 * to a file beside it is not. The paths below are copied from the docs, never read from the code.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionMode } from '../../src/protocol/official.ts';
import { allow, ask, classify, deny, onPath } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const PREFIX = 'permissions.modes.Protected paths';
const PROJECT = '/work/app';

/** The path a write to each named entry targets (a directory gets a file below it). */
const TARGETS: Readonly<Record<string, string>> = {
  '.bashrc': `${PROJECT}/.bashrc`,
  '.bazelrc': `${PROJECT}/.bazelrc`,
  '.cargo': `${PROJECT}/.cargo/config.toml`,
  '.claude': `${PROJECT}/.claude/settings.json`,
  '.config/git': `${PROJECT}/.config/git/config`,
  '.devcontainer': `${PROJECT}/.devcontainer/Dockerfile`,
  '.devcontainer.json': `${PROJECT}/.devcontainer.json`,
  '.git': `${PROJECT}/.git/config`,
  '.gitconfig': `${PROJECT}/.gitconfig`,
  '.husky': `${PROJECT}/.husky/pre-commit`,
  '.idea': `${PROJECT}/.idea/workspace.xml`,
  '.mcp.json': `${PROJECT}/.mcp.json`,
  '.mvn': `${PROJECT}/.mvn/maven.config`,
  '.npmrc': `${PROJECT}/.npmrc`,
  '.pre-commit-config.yaml': `${PROJECT}/.pre-commit-config.yaml`,
  '.ripgreprc': `${PROJECT}/.ripgreprc`,
  '.vscode': `${PROJECT}/.vscode/settings.json`,
  '.yarn': `${PROJECT}/.yarn/releases/yarn.cjs`,
  'gradle-wrapper.properties': `${PROJECT}/gradle/wrapper/gradle-wrapper.properties`,
  'remote-settings.json': `${PROJECT}/remote-settings.json`,
  '~/.claude/dev-mods/': '/home/alice/.claude/dev-mods/mod.js',
};

const protectedWrite = (path: string) => onPath('acceptEdits', 'Write', path);
const ordinaryWrite = onPath('acceptEdits', 'Write', `${PROJECT}/src/index.ts`);

for (const [name, target] of Object.entries(TARGETS)) {
  spec(`${PREFIX}.${name}`, () => {
    describe(`"Protected paths": ${name}`, () => {
      test('a write to it is protected, where an ordinary write is not', () => {
        expect(protectedWrite(target)).toEqual(ask('protected-path'));
        expect(ordinaryWrite).not.toEqual(ask('protected-path'));
      });
    });
  });
}

/** The "Protected-path writes" column of the table, per mode, for a write to `.git/config`. */
const MODES: Readonly<Record<string, readonly [PermissionMode, ReturnType<typeof ask>]>> = {
  acceptEdits: ['acceptEdits', ask('protected-path')],
  auto: ['auto', classify('protected-path')],
  bypassPermissions: ['bypassPermissions', allow('mode-bypass')],
  default: ['default', ask('protected-path')],
  dontAsk: ['dontAsk', deny('protected-path')],
  plan: ['plan', ask('protected-path')],
};

for (const [name, [mode, expected]] of Object.entries(MODES)) {
  spec(`${PREFIX}.${name}`, () => {
    test(`a write to .git/config in ${mode} mode gets the outcome of the table`, () => {
      expect(onPath(mode, 'Write', `${PROJECT}/.git/config`)).toEqual(expected);
    });
  });
}

spec(PREFIX, () => {
  test('a write to .git/config or .gitmodules is protected in acceptEdits mode', () => {
    expect(protectedWrite(`${PROJECT}/.git/config`)).toEqual(ask('protected-path'));
    expect(protectedWrite(`${PROJECT}/.gitmodules`)).toEqual(ask('protected-path'));
  });
});
