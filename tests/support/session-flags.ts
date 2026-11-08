/** Helpers for the session-flag tests: the facts of a run and the plan of the flags given to it. */
import { planSessionFlags } from '../../src/cli/session-flags.ts';
import type { FlagFacts, GivenFlags, SessionPlan } from '../../src/cli/flags/types.ts';

const facts = (extra: Partial<FlagFacts> = {}): FlagFacts => ({
  print: false,
  resume: false,
  continuing: false,
  env: {},
  platform: 'posix',
  sideloadDisabled: false,
  files: {},
  directories: {},
  ...extra,
});

export const planOf = (given: GivenFlags, extra: Partial<FlagFacts> = {}): SessionPlan =>
  planSessionFlags(given, facts(extra));

/** A `--print` run, which most subagent and channel flags need. */
export const printFacts = (extra: Partial<FlagFacts> = {}): Partial<FlagFacts> => ({
  print: true,
  ...extra,
});

export const file = (text: string, extra: { regular?: boolean; bytes?: number } = {}) => ({
  regular: extra.regular ?? true,
  bytes: extra.bytes ?? text.length,
  text,
});
