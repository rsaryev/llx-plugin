import { type ModScan } from '../scan/index.ts';
import { callLabel, hookLabel } from '../scan/uses.ts';

/** A sorted list, or `nothing` (claude plugin validate 2.1.321). */
const listed = (items: readonly string[]): string =>
  items.length === 0 ? 'nothing' : items.toSorted().join(', ');

/**
 * Lines of one scanned module: `❯ ./register.js hooks: ...`, `calls:` (`nothing on $` when it calls
 * none), the `env` and the `state` lines (writes, then reads, the other side `nothing`, once the
 * module uses either), then each gating hook. The order, the sorting and the `nothing` words are
 * oracle 2.1.321 (`claude plugin validate`, black box; spec/judgments.md).
 */
export function scanLines(written: string, scan: ModScan): string[] {
  const lines: string[] = [];
  const add = (label: string, items: readonly string[]): void => {
    if (items.length > 0) lines.push(`  ❯ ${written} ${label}: ${items.join(', ')}`);
  };
  const pair = (noun: string, writes: readonly string[], reads: readonly string[]): void => {
    if (writes.length + reads.length === 0) return;
    lines.push(`  ❯ ${written} ${noun} writes: ${listed(writes)}`);
    lines.push(`  ❯ ${written} ${noun} reads: ${listed(reads)}`);
  };
  add('hooks', scan.hooks.map(hookLabel));
  const calls = scan.calls.map(callLabel);
  lines.push(`  ❯ ${written} calls: ${calls.length === 0 ? 'nothing on $' : listed(calls)}`);
  pair('env', scan.envWrites, scan.envReads);
  pair('state', scan.stateWrites, scan.stateReads);
  add('surface modules', scan.surfaceModules);
  for (const hook of scan.hooks.filter((found) => found.isGating)) {
    lines.push(
      `  ❯ ${written} gating hook ${hook.hasCatch ? 'with' : 'without'} .catch: ${hook.event}`,
    );
  }
  return lines;
}
