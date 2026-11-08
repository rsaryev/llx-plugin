import { createEventRules } from '../../src/mods/events/index.ts';
import { harness } from './mods-chain.ts';

/** A chain with the event rules of the events part of mods: result shapes, refused changes, what Claude Code receives. */
export const eventHarness = () => harness(undefined, createEventRules());

/** The reasons the chain gave for the hooks it skipped. */
export const reasonsOf = (h: ReturnType<typeof eventHarness>): string[] =>
  h.reports.map((report) => report.reason);
