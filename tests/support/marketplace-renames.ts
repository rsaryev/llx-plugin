/** The documented renames marketplace, shared by the renames and removal tests. */
import { readMarketplace } from '../../src/format/marketplace/marketplace.ts';
import type { Marketplace } from '../../src/format/marketplace/types.ts';

export const NAME = 'your-marketplace';
export const REMOVED = 'Removed from the "your-marketplace" marketplace';

/** The marketplace.json of the docs: `formatter` became `code-formatter`, `legacy-linter` was removed. */
export const documentedFile = {
  name: NAME,
  owner: { name: 'Your Org' },
  plugins: [{ name: 'code-formatter', source: './plugins/code-formatter' }],
  renames: { formatter: 'code-formatter', 'legacy-linter': null },
};

export const read = (raw: unknown): Marketplace => {
  const { marketplace } = readMarketplace(raw);
  if (marketplace === undefined) throw new Error('the marketplace does not load');
  return marketplace;
};
export const documented = read(documentedFile);

export const key = (plugin: string) => `${plugin}@${NAME}`;
