/**
 * sub-agents.md, "Set the auto-compact window for one subagent", "Frontmatter reference" (the rows
 * for `autoCompactWindow`, `maxTurns`, `experimental`) and "Resume subagents"; model-config.md,
 * "Set the auto-compact window" and "Values and warnings for `CLAUDE_CODE_AUTO_COMPACT_WINDOW`";
 * prompt-caching.md, "Choose the TTL yourself". The compaction, the turn loop and the cache are
 * the host's; the kit owns the decision each field drives.
 */
import { describe, expect, test } from 'bun:test';
import {
  effectiveAutoCompactWindow,
  effectiveCacheTtl,
  turnLimitOutcome,
} from '../../src/agents/launch.ts';
import { agentWith, readWith } from '../support/launch.ts';
import { spec } from '../support/spec.ts';

const window = (
  field: number | undefined,
  extra: Partial<Parameters<typeof effectiveAutoCompactWindow>[0]> = {},
) => effectiveAutoCompactWindow({ field, inherited: 967_000, asMainSession: false, ...extra });

spec('agents.frontmatter.autoCompactWindow', () => {
  test('the documented example: log-reader compacts at 200000 instead of the inherited window', () => {
    const log = agentWith('autoCompactWindow: 200000').definition.autoCompactWindow;
    expect(log).toBe(200_000);
    expect(window(log)).toBe(200_000);
  });

  test('the field only lowers: a value not below the inherited window changes nothing', () => {
    expect(window(500_000, { inherited: 200_000 })).toBe(200_000);
    expect(window(200_000, { inherited: 200_000 })).toBe(200_000);
    expect(window(300_000, { inherited: 200_000 })).toBe(200_000);
  });

  test('CLAUDE_CODE_AUTO_COMPACT_WINDOW wins and the field has no effect', () => {
    expect(window(200_000, { env: 400_000, inherited: 400_000 })).toBe(400_000);
    expect(window(150_000, { env: 600_000, inherited: 600_000 })).toBe(600_000);
  });

  test('...unless Claude Code ignores the variable (no usable size): then the field applies', () => {
    expect(window(200_000, { env: Number.NaN })).toBe(200_000);
    expect(window(200_000, { env: 0 })).toBe(200_000);
  });

  test('a variable below the minimum or above the maximum is treated as 100000 or 1000000', () => {
    expect(window(undefined, { env: 200 })).toBe(100_000);
    expect(window(undefined, { env: 5_000_000 })).toBe(1_000_000);
  });

  test('running the whole session as the subagent (--agent, `agent` setting): the field has no effect', () => {
    expect(window(200_000, { asMainSession: true })).toBe(967_000);
  });

  test('`200k` reads as 200, out of range: the field is dropped with `invalid autoCompactWindow` and the subagent compacts as if it were absent', () => {
    const result = readWith('autoCompactWindow: 200k');
    expect(result.issues.map((issue) => issue.message).join('\n')).toContain(
      'invalid autoCompactWindow',
    );
    const field = agentWith('autoCompactWindow: 200k').definition.autoCompactWindow;
    expect(field).toBeUndefined();
    expect(window(field)).toBe(967_000);
  });

  test('a value outside 100000 to 1000000 has no effect either, however it got here', () => {
    expect(window(99_999, { inherited: 967_000 })).toBe(967_000);
    expect(window(1_000_001, { inherited: 2_000_000 })).toBe(2_000_000);
  });
});

spec('agents.frontmatter.maxTurns', () => {
  test('the subagent stops at the limit and its output is marked partial', () => {
    expect(turnLimitOutcome(12, 12)).toEqual({ stop: true, partial: true });
  });

  test('below the limit it continues', () => {
    expect(turnLimitOutcome(12, 11)).toEqual({ stop: false, partial: false });
    expect(turnLimitOutcome(12, 0)).toEqual({ stop: false, partial: false });
  });

  test('without maxTurns there is no limit', () => {
    expect(turnLimitOutcome(undefined, 10_000)).toEqual({ stop: false, partial: false });
  });

  test('the value read from a file drives it', () => {
    const maxTurns = agentWith('maxTurns: 3').definition.maxTurns;
    expect(turnLimitOutcome(maxTurns, 2).stop).toBe(false);
    expect(turnLimitOutcome(maxTurns, 3).partial).toBe(true);
  });
});

spec('agents.frontmatter.experimental', () => {
  test('the documented example: repo-auditor sets cacheTtl 1h in the experimental map', () => {
    const { extras } = agentWith('experimental:\n  cacheTtl: 1h');
    expect(effectiveCacheTtl({ cacheTtl: extras.cacheTtl, usingUsageCredits: false })).toBe('1h');
    expect(
      effectiveCacheTtl({
        cacheTtl: agentWith('experimental:\n  cacheTtl: 5m').extras.cacheTtl,
        usingUsageCredits: false,
      }),
    ).toBe('5m');
  });

  test('a `1h` is ignored while the subscription is using usage credits, a `5m` is not', () => {
    expect(effectiveCacheTtl({ cacheTtl: '1h', usingUsageCredits: true })).toBeUndefined();
    expect(effectiveCacheTtl({ cacheTtl: '5m', usingUsageCredits: true })).toBe('5m');
  });

  test('with no cacheTtl the frontmatter says nothing and the next control in the precedence applies', () => {
    expect(effectiveCacheTtl({ usingUsageCredits: false })).toBeUndefined();
  });

  test('cacheTtl at the top level of the frontmatter is not read: only the experimental map counts', () => {
    const { extras } = agentWith('cacheTtl: 1h');
    expect(
      effectiveCacheTtl({ cacheTtl: extras.cacheTtl, usingUsageCredits: false }),
    ).toBeUndefined();
  });

  test('any other value of the map is ignored', () => {
    const { extras } = agentWith('experimental:\n  cacheTtl: 2h\n  other: true');
    expect(
      effectiveCacheTtl({ cacheTtl: extras.cacheTtl, usingUsageCredits: false }),
    ).toBeUndefined();
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a turn count that is no positive whole number sets no limit', () => {
    for (const value of [0, -1, 2.5, Number.NaN]) {
      expect(turnLimitOutcome(value, 100)).toEqual({ stop: false, partial: false });
    }
  });

  test('a value in the window field that is not a whole number does not lower the window', () => {
    expect(window(200_000.5)).toBe(967_000);
  });
});
