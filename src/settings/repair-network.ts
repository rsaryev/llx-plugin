/**
 * `gatewayInternalNetworks` (settings-reference.md, `gatewayInternalNetworks`): "array of strings,
 * at most four IPv4 CIDR blocks, each `/8` to `/32`, not overlapping one another, and none
 * overlapping private space". The docs name no private ranges; the kit takes RFC 1918's
 * (spec/judgments.md).
 */
const MAX_BLOCKS = 4;
const MIN_PREFIX = 8;

interface Range {
  readonly first: number;
  readonly last: number;
}

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/** The addresses a block covers, or `undefined` for text that is no IPv4 CIDR block of `/8` to `/32`. */
function rangeOf(text: string): Range | undefined {
  const match = CIDR.exec(text);
  if (match === null) return undefined;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix < MIN_PREFIX || prefix > 32) return undefined;
  const address = octets.reduce((total, octet) => total * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  const first = Math.floor(address / size) * size;
  return { first, last: first + size - 1 };
}

const overlap = (a: Range, b: Range): boolean => a.first <= b.last && b.first <= a.last;

const PRIVATE_SPACE: readonly Range[] = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].flatMap(
  (block) => rangeOf(block) ?? [],
);

/** Why the value cannot be enforced, or `undefined` when it is a valid list of blocks. */
export function gatewayNetworksFault(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'it must be a list of IPv4 CIDR blocks';
  if (value.length > MAX_BLOCKS) return `it lists more than ${MAX_BLOCKS} blocks`;
  const ranges = value.map((entry) => (typeof entry === 'string' ? rangeOf(entry) : undefined));
  const blocks = ranges.filter((range) => range !== undefined);
  if (blocks.length < ranges.length) return 'a block is no IPv4 CIDR block of /8 to /32';
  if (blocks.some((block) => PRIVATE_SPACE.some((space) => overlap(block, space)))) {
    return 'a block overlaps private space';
  }
  const crossing = blocks.some((block, index) =>
    blocks.some((other, at) => at > index && overlap(block, other)),
  );
  return crossing ? 'two blocks overlap' : undefined;
}
