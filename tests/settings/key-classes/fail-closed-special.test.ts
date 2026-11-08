/**
 * managed-settings.md § Keys that fail closed (the table rows whose fallback is not a value:
 * `crossSessionInbound`, `gatewayInternalNetworks`, `sandbox`, `sandbox.credentials`),
 * settings-reference.md § `gatewayInternalNetworks` (the shape of a valid value) and
 * claude-apps-gateway.md § "Allow a gateway on public address space you own" (the refused ranges),
 * errors.md § crossSessionInbound. The `sandbox.credentials` row is in sandbox-credentials.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { gatewaySignInRefused } from '../../../src/settings/managed/index.ts';
import { compose } from '../../support/managed.ts';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ID = 'policy.managed.Keys that fail closed';

spec(`${ID}.crossSessionInbound`, () => {
  test('an unrecognized value in managed settings is treated as refuse, the most restrictive value', () => {
    const raw = { crossSessionInbound: 'reject' };
    expect(viewOf(['managed', raw]).get('crossSessionInbound')).toBe('refuse');
    expect(
      viewOf(['managed', raw], ['user', { crossSessionInbound: 'accept' }]).get(
        'crossSessionInbound',
      ),
    ).toBe('refuse');
  });

  test('the warning names the value and says messages are turned away until an administrator fixes it', () => {
    const [message] = messagesOf('managed', { crossSessionInbound: 'reject' });
    expect(message).toContain(
      '"crossSessionInbound" must be one of "accept", "hold", "refuse"; received "reject"',
    );
    expect(message).toContain('turned away until an administrator fixes it');
  });

  test('a recognized value is kept as it is', () => {
    for (const value of ['accept', 'hold', 'refuse'] as const) {
      expect(viewOf(['managed', { crossSessionInbound: value }]).get('crossSessionInbound')).toBe(
        value,
      );
    }
  });
});

describe('gatewayInternalNetworks', () => {
  const refused = (raw: unknown, held: Record<string, unknown> = {}) =>
    gatewaySignInRefused(compose({ file: raw, ...held }).layer);

  spec(`${ID}.gatewayInternalNetworks`, () => {
    test('an invalid value from the highest managed source on the machine refuses every new gateway sign-in', () => {
      expect(refused({ gatewayInternalNetworks: 'oops' })).toBe(true);
      expect(refused({ gatewayInternalNetworks: ['11.22.33.0/24'] })).toBe(false);
      expect(refused({ model: 'a' })).toBe(false);
    });

    test('the value is reported as present but invalid', () => {
      const issues = compose({ file: { gatewayInternalNetworks: 'oops' } }).issues;
      expect(
        issues.some((issue) =>
          issue.message.includes('"gatewayInternalNetworks" was present but invalid'),
        ),
      ).toBe(true);
    });

    test('a value of the shape the docs give is valid: at most four IPv4 blocks of /8 to /32 that do not overlap each other or private space', () => {
      const valid = [
        ['11.22.33.0/24'],
        ['11.22.33.0/24', '12.1.0.0/16', '13.0.0.0/24', '8.0.0.0/8'],
        ['11.22.33.7/32'],
        ['240.0.0.0/8', '255.0.0.0/8'],
        [],
      ];
      for (const networks of valid)
        expect(refused({ gatewayInternalNetworks: networks })).toBe(false);
    });

    describe('every other value is invalid', () => {
      const invalid: readonly (readonly [string, unknown])[] = [
        [
          'more than four blocks',
          ['1.0.0.0/8', '2.0.0.0/8', '3.0.0.0/8', '4.0.0.0/8', '5.0.0.0/8'],
        ],
        ['a block wider than /8', ['128.0.0.0/7']],
        ['a block that is no CIDR', ['11.22.33.0']],
        ['an octet above 255', ['11.22.33.256/24']],
        ['an IPv6 block', ['2001:db8::/32']],
        ['two overlapping blocks', ['11.22.33.0/24', '11.22.0.0/16']],
        ['a block inside private space', ['10.1.0.0/16']],
        ['a block that covers private space', ['172.0.0.0/8']],
        ['loopback', ['127.0.0.0/8']],
        ['link-local', ['169.254.0.0/16']],
        ['CGNAT', ['100.64.0.0/10']],
        ['a VPN and NAT64 range', ['198.18.0.0/15']],
        ['the other VPN and NAT64 range', ['192.0.0.0/24']],
        ['the documentation range 192.0.2.0/24', ['192.0.2.0/24']],
        ['the documentation range 198.51.100.0/24', ['198.51.100.0/24']],
        ['the documentation range 203.0.113.0/24, the docs example', ['203.0.113.0/24']],
        ['a block inside a documentation range', ['203.0.113.7/32']],
        ['a block that covers a documentation range', ['203.0.0.0/8']],
        ['the reserved range 0.0.0.0/8', ['0.0.0.0/8']],
        ['the reserved range 192.88.99.0/24', ['192.88.99.0/24']],
        ['the first multicast /8', ['224.0.0.0/8']],
        ['the last multicast /8', ['239.0.0.0/8']],
        ['a block inside multicast', ['239.1.0.0/16']],
        ['a non-text entry', [5]],
      ];
      for (const [name, networks] of invalid) {
        test(name, () => expect(refused({ gatewayInternalNetworks: networks })).toBe(true));
      }
    });

    test('a source that is not on the machine never supplies the key, so an invalid remote value refuses nothing', () => {
      expect(
        gatewaySignInRefused(
          compose({ remote: { gatewayInternalNetworks: 'oops', model: 'a' }, file: { model: 'b' } })
            .layer,
        ),
      ).toBe(false);
    });

    test('only the highest managed source on the machine counts: an invalid value below a valid one refuses nothing', () => {
      const valid = { gatewayInternalNetworks: ['11.22.33.0/24'] };
      const invalid = { gatewayInternalNetworks: 'oops' };
      // plist > hklm > file in precedence; each pair puts the invalid value in the lower source
      expect(gatewaySignInRefused(compose({ plist: valid, file: invalid }).layer)).toBe(false);
      expect(gatewaySignInRefused(compose({ hklm: valid, file: invalid }).layer)).toBe(false);
      expect(gatewaySignInRefused(compose({ plist: valid, hklm: invalid }).layer)).toBe(false);
    });

    test('the same invalid value in the highest source does refuse, whichever machine source that is', () => {
      const invalid = { gatewayInternalNetworks: 'oops' };
      for (const source of ['plist', 'hklm', 'file'] as const) {
        expect(gatewaySignInRefused(compose({ [source]: invalid }).layer)).toBe(true);
      }
    });

    test('an invalid value in HKCU is ignored: Claude Code ignores the key there', () => {
      const invalid = { gatewayInternalNetworks: 'oops' };
      expect(gatewaySignInRefused(compose({ hkcu: { ...invalid, model: 'a' } }).layer)).toBe(false);
      expect(
        gatewaySignInRefused(compose({ file: { model: 'b' }, hkcu: { ...invalid } }).layer),
      ).toBe(false);
      expect(compose({ file: { model: 'b' }, hkcu: invalid }).layer.settings).not.toHaveProperty(
        'gatewayInternalNetworks',
      );
    });

    test('in a user file the value is not read at all', () => {
      expect(
        viewOf(['user', { gatewayInternalNetworks: 'oops' }]).layers[0]?.invalid,
      ).toBeUndefined();
    });
  });
});

spec(`${ID}.sandbox`, () => {
  test('one invalid value does not drop the block: the other fields stay enforced', () => {
    const raw = {
      sandbox: {
        enabled: 'maybe',
        network: { allowedDomains: ['github.com'], allowLocalBinding: 7 },
        excludedCommands: ['docker'],
      },
    };
    const sandbox = viewOf(['managed', raw]).get('sandbox');
    expect(sandbox?.enabled).toBe(true);
    expect(sandbox?.network?.allowedDomains).toEqual(['github.com']);
    expect(sandbox?.network?.allowLocalBinding).toBe(false);
    expect(sandbox?.excludedCommands).toEqual(['docker']);
  });

  test('in a user file the block is kept as written, the file stays strict about its entries only', () => {
    expect(plain(viewOf(['user', { sandbox: { enabled: 'maybe' } }]).get('sandbox'))).toEqual({
      enabled: 'maybe',
    });
  });
});
