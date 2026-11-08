/**
 * Hosts a download may not point at: "can't point at a loopback, link-local, or cloud-metadata
 * host" (plugins/marketplace-reference.md, "archive plugin source"; plugins/host-marketplace.md,
 * "Stay within the download limits for hosted files"). The docs name three categories, not the
 * hosts in them, so the check is lexical, over the address as written, and the lists are the
 * kit's judgment (spec/judgments.md). The kit resolves no name: a DNS name that merely resolves to
 * a blocked address is for the host's `HttpClient` egress policy.
 */

/** Names that are loopback or cloud-metadata endpoints by name. */
const BLOCKED_NAMES = new Set(['localhost', 'metadata.google.internal']);
const BLOCKED_SUFFIXES = ['.localhost'];

/** Cloud metadata services that are not in a link-local range (Alibaba Cloud). */
const BLOCKED_IPV4 = new Set(['0.0.0.0', '100.100.100.200']);

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isBlockedIpv4(host: string): boolean {
  if (BLOCKED_IPV4.has(host)) return true;
  const match = IPV4.exec(host);
  if (match === null) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const loopback = first === 127;
  const linkLocal = first === 169 && second === 254;
  return loopback || linkLocal;
}

const groupsOf = (text: string): number[] =>
  text === '' ? [] : text.split(':').map((group) => Number.parseInt(group, 16));

/** The eight 16-bit groups of an IPv6 address as written (`::` expanded), or `undefined` when it is not one. */
function ipv6Groups(host: string): number[] | undefined {
  const sides = host.split('::');
  if (sides.length > 2 || !/^[0-9a-f:.]+$/i.test(host)) return undefined;
  const head = groupsOf(sides[0] ?? '');
  const tail = sides.length === 2 ? groupsOf(sides[1] ?? '') : [];
  const fill = 8 - head.length - tail.length;
  if (sides.length === 1 ? head.length !== 8 : fill < 1) return undefined;
  const groups = [
    ...head,
    ...Array.from({ length: sides.length === 2 ? fill : 0 }, () => 0),
    ...tail,
  ];
  return groups.some(Number.isNaN) ? undefined : groups;
}

const AWS_IPV6_METADATA = [0xfd00, 0xec2, 0, 0, 0, 0, 0, 0x254];

function isBlockedIpv6(host: string): boolean {
  const groups = ipv6Groups(host);
  if (groups === undefined) return false;
  const [first = 0] = groups;
  const zeros = groups.slice(0, 7).every((group) => group === 0);
  const loopback = zeros && (groups[7] === 1 || groups[7] === 0);
  const linkLocal = (first & 0xffc0) === 0xfe80;
  const metadata = AWS_IPV6_METADATA.every((group, index) => groups[index] === group);
  return loopback || linkLocal || metadata || isBlockedMapped(groups);
}

/** `::ffff:a.b.c.d`, an IPv4 address in IPv6 clothes: the URL parser writes it as two hex groups. */
function isBlockedMapped(groups: readonly number[]): boolean {
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!mapped) return false;
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return isBlockedIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
}

/** True when `hostname` (as `URL.hostname` writes it, IPv6 in brackets) is loopback, link-local or a metadata host. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (BLOCKED_NAMES.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return host.includes(':') ? isBlockedIpv6(host) : isBlockedIpv4(host);
}
