/**
 * permissions.md § Compound commands, hostile spellings of here-documents: the delimiter is the
 * whole word after `<<` with its quotes removed (`'E'OF` is `EOF`), a quoted delimiter makes the
 * body text, and an unquoted one still runs what `$(...)` and backticks substitute in it.
 */
import { describe, expect, test } from 'bun:test';
import { allows, denies } from '../support/bash-rules.ts';
import { allow, bash } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('permissions.behavior.Compound commands', () => {
  test('a partly quoted delimiter ends at the whole word, so later lines run', () => {
    const command = "cat <<'E'OF\nhello\nEOF\nrm -rf /\nE";
    expect(denies('Bash(rm *)', command)).toBe(true);
    expect(allows('Bash(cat *)', command)).toBe(false);
    expect(bash('default', command).outcome).toBe('ask');
  });

  test('an unquoted body runs its substitutions; a quoted body does not', () => {
    expect(denies('Bash(rm *)', 'cat <<EOF\n$(rm -rf /)\nEOF')).toBe(true);
    expect(denies('Bash(rm *)', 'cat <<EOF\n`rm -rf /`\nEOF')).toBe(true);
    expect(denies('Bash(rm *)', 'cat <<"EOF"\n$(rm -rf /)\nEOF')).toBe(false);
    expect(denies('Bash(rm *)', 'cat <<\\EOF\n$(rm -rf /)\nEOF')).toBe(false);
  });

  test('<<- ends at a tab-indented delimiter; text after the opener on its line runs', () => {
    expect(denies('Bash(rm *)', 'cat <<-EOF\n\thi\n\tEOF\nrm -rf /')).toBe(true);
    expect(denies('Bash(rm *)', 'cat <<EOF; rm -rf /\nbody\nEOF')).toBe(true);
    expect(denies('Bash(rm *)', 'cat <<EOF\nEOF \nrm -rf /\nEOF')).toBe(false);
  });
});

describe('Here-document bodies are text', () => {
  test('a body line is no command', () => {
    expect(allows('Bash(cat *)', 'cat <<EOF\nrm -rf /\nEOF')).toBe(true);
    expect(bash('default', "cat <<'EOF'\nrm -rf /\nEOF")).toEqual(allow('read-only-command'));
  });
});
