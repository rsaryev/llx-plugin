/**
 * `gatewayInternalNetworks` (settings-reference.md, `gatewayInternalNetworks`; claude-apps-gateway.md,
 * "Allow a gateway on public address space you own"): an array of strings, at most four IPv4 CIDR
 * blocks, each `/8` to `/32`, not overlapping one another, none overlapping private space or space
 * that is never an organization's network. `240.0.0.0/4` is allowed.
 */
const MAX_BLOCKS = 4;
const MIN_PREFIX = 8;

interface Range {
  readonly first: number;
  readonly last: number;
}

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/** The addresses a block of prefix `minPrefix` to `/32` covers, or `undefined` for text that is no such IPv4 CIDR block. */
function rangeOf(text: string, minPrefix = MIN_PREFIX): Range | undefined {
  const match = CIDR.exec(text);
  if (match === null) return undefined;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix < minPrefix || prefix > 32) return undefined;
  const address = octets.reduce((total, octet) => total * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  const first = Math.floor(address / size) * size;
  return { first, last: first + size - 1 };
}

const overlap = (a: Range, b: Range): boolean => a.first <= b.last && b.first <= a.last;

/** The ranges of `blocks`; a constant below is always a valid CIDR block. */
const rangesOf = (blocks: readonly string[]): readonly Range[] =>
  blocks.flatMap((block) => rangeOf(block, 0) ?? []);

/** Private address space, which `/login` already accepts without the key. */
const PRIVATE_SPACE = rangesOf([
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '100.64.0.0/10',
]);

/** Space that is never an organization's network: VPN and NAT64 local addresses, documentation ranges, reserved ranges and multicast. */
const NEVER_A_NETWORK = rangesOf([
  '198.18.0.0/15',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '0.0.0.0/8',
  '192.88.99.0/24',
  '224.0.0.0/4',
]);

/** Why the value cannot be enforced, or `undefined` when it is a valid list of blocks. */
export function gatewayNetworksFault(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'it must be a list of IPv4 CIDR blocks';
  if (value.length > MAX_BLOCKS) return `it lists more than ${MAX_BLOCKS} blocks`;
  const ranges = value.map((entry) => (typeof entry === 'string' ? rangeOf(entry) : undefined));
  const blocks = ranges.filter((range) => range !== undefined);
  if (blocks.length < ranges.length) return 'a block is no IPv4 CIDR block of /8 to /32';
  const inside = (spaces: readonly Range[]): boolean =>
    blocks.some((block) => spaces.some((space) => overlap(block, space)));
  if (inside(PRIVATE_SPACE)) return 'a block overlaps private space';
  if (inside(NEVER_A_NETWORK))
    return "a block overlaps space that is never an organization's network";
  const crossing = blocks.some((block, index) =>
    blocks.some((other, at) => at > index && overlap(block, other)),
  );
  return crossing ? 'two blocks overlap' : undefined;
}
