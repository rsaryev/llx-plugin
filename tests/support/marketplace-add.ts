/** Helpers for the `marketplace add` tests: the start of an add, and what it ends with. */
import type { AddArguments, AddFetched, AddStart } from '../../src/cli/marketplace-add.ts';
import { concludeMarketplaceAdd, startMarketplaceAdd } from '../../src/cli/marketplace-add.ts';
import { renderCommand, type CommandOutput } from '../../src/cli/result.ts';

export const FILE = '.claude-plugin/marketplace.json';

export function started(args: AddArguments): Extract<AddStart, { kind: 'fetch' }> {
  const start = startMarketplaceAdd(args);
  if (start.kind !== 'fetch') throw new Error(`not a fetch: ${JSON.stringify(start)}`);
  return start;
}

export const finished = (args: AddArguments): CommandOutput => {
  const start = startMarketplaceAdd(args);
  if (start.kind !== 'done') throw new Error(`not done: ${start.kind}`);
  return start.output;
};

export const fetched = (name: string, extra: Partial<AddFetched> = {}): AddFetched => ({
  name,
  alreadyOnDisk: false,
  registered: [],
  ...extra,
});

export function concluded(args: AddArguments, found: AddFetched) {
  return concludeMarketplaceAdd(started(args), found);
}

export const stdoutOf = (output: CommandOutput, json = false): string[] => [
  ...renderCommand(output, { json }).stdout,
];
