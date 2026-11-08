/**
 * managed-mcp.md § "How `serverUrl` entries match": "URLs support `*` wildcards, including `*` as the
 * whole scheme. Hostname matching is case-insensitive and ignores a trailing FQDN dot, so
 * `https://Mcp.Example.com/*` matches `https://mcp.example.com/api`. Paths stay case-sensitive. If you
 * give no port, how you write the hostname decides whether the pattern matches only the scheme's
 * default port or every port: a hostname written out in full means the default port only, 443 for
 * `https` and 80 for `http`; a hostname with a `*` in it means every port." The table of seven
 * patterns and the three denylist patterns for `staging.example.com` are the requirements below.
 */
import { describe, expect, test } from 'bun:test';
import { urlPatternMatches } from '../../../src/settings/mcp/url-pattern.ts';
import { spec } from '../../support/spec.ts';

const PAGE = 'mcpSettings.managed.How serverUrl entries match';
const matches = (pattern: string, url: string): boolean => urlPatternMatches(pattern, url);

spec(PAGE, () => {
  test('the docs example: Mcp.Example.com matches mcp.example.com/api, and the scheme is case-insensitive too', () => {
    expect(matches('https://Mcp.Example.com/*', 'https://mcp.example.com/api')).toBe(true);
    expect(matches('HTTPS://mcp.example.com/*', 'https://mcp.example.com/api')).toBe(true);
    expect(matches('https://mcp.example.com/*', 'https://MCP.EXAMPLE.COM/api')).toBe(true);
  });

  test('a trailing FQDN dot is ignored on either side', () => {
    expect(matches('https://mcp.example.com/*', 'https://mcp.example.com./api')).toBe(true);
    expect(matches('https://mcp.example.com./*', 'https://mcp.example.com/api')).toBe(true);
  });

  test('paths stay case-sensitive', () => {
    expect(matches('https://mcp.example.com/Api/*', 'https://mcp.example.com/Api/x')).toBe(true);
    expect(matches('https://mcp.example.com/Api/*', 'https://mcp.example.com/api/x')).toBe(false);
  });

  test('a path pattern is a glob, and a different path does not match', () => {
    expect(matches('https://mcp.example.com/v1/*', 'https://mcp.example.com/v1/tools/list')).toBe(
      true,
    );
    expect(matches('https://mcp.example.com/v1/*', 'https://mcp.example.com/v2/tools')).toBe(false);
    expect(matches('https://mcp.example.com/mcp', 'https://mcp.example.com/mcp')).toBe(true);
    expect(matches('https://mcp.example.com/mcp', 'https://mcp.example.com/mcp/extra')).toBe(false);
  });

  test('a scheme that is not the pattern scheme does not match', () => {
    expect(matches('https://mcp.example.com/*', 'http://mcp.example.com/api')).toBe(false);
  });

  test('a host that only contains the pattern host does not match', () => {
    expect(matches('https://mcp.example.com/*', 'https://evil-mcp.example.com/api')).toBe(false);
    expect(matches('https://mcp.example.com/*', 'https://mcp.example.com.evil.com/api')).toBe(
      false,
    );
  });
});

spec(`${PAGE}.https://mcp.example.com/*`, () => {
  test('all paths on a specific domain, on port 443 only', () => {
    const pattern = 'https://mcp.example.com/*';
    expect(matches(pattern, 'https://mcp.example.com/')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com/a/b/c')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:443/a')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:8443/a')).toBe(false);
    expect(matches(pattern, 'https://other.example.com/a')).toBe(false);
  });
});

spec(`${PAGE}.https://mcp.example.com`, () => {
  test('also all paths on that domain, on port 443 only: a pattern with no path matches any path', () => {
    const pattern = 'https://mcp.example.com';
    expect(matches(pattern, 'https://mcp.example.com')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com/')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com/any/path')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com/mcp?token=abc')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:8443/any')).toBe(false);
  });
});

spec(`${PAGE}.https://mcp.example.com:8443/*`, () => {
  test('all paths on that domain, on port 8443 only', () => {
    const pattern = 'https://mcp.example.com:8443/*';
    expect(matches(pattern, 'https://mcp.example.com:8443/api')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com/api')).toBe(false);
    expect(matches(pattern, 'https://mcp.example.com:9443/api')).toBe(false);
  });
});

spec(`${PAGE}.https://mcp.example.com:*/*`, () => {
  test('all paths on that domain, on any port, 443 included', () => {
    const pattern = 'https://mcp.example.com:*/*';
    expect(matches(pattern, 'https://mcp.example.com/api')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:443/api')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:8443/api')).toBe(true);
    expect(matches(pattern, 'https://other.example.com:8443/api')).toBe(false);
  });
});

spec(`${PAGE}.https://*.example.com/*`, () => {
  test('any subdomain of example.com, on any port', () => {
    const pattern = 'https://*.example.com/*';
    expect(matches(pattern, 'https://mcp.example.com/api')).toBe(true);
    expect(matches(pattern, 'https://a.b.example.com:8443/api')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:1/api')).toBe(true);
  });

  test('not the apex domain, another domain, or another scheme', () => {
    const pattern = 'https://*.example.com/*';
    expect(matches(pattern, 'https://example.com/api')).toBe(false);
    expect(matches(pattern, 'https://mcp.example.org/api')).toBe(false);
    expect(matches(pattern, 'https://evil.com/.example.com/x')).toBe(false);
    expect(matches(pattern, 'http://mcp.example.com/api')).toBe(false);
  });
});

spec(`${PAGE}.http://localhost:*/*`, () => {
  test('any port on localhost', () => {
    const pattern = 'http://localhost:*/*';
    expect(matches(pattern, 'http://localhost:3000/mcp')).toBe(true);
    expect(matches(pattern, 'http://localhost/mcp')).toBe(true);
    expect(matches(pattern, 'http://localhost:80/mcp')).toBe(true);
    expect(matches(pattern, 'https://localhost:3000/mcp')).toBe(false);
    expect(matches(pattern, 'http://localhost.evil.com:3000/mcp')).toBe(false);
  });
});

spec(`${PAGE}.*://mcp.example.com/*`, () => {
  test('any scheme to a specific domain, each scheme on its default port only', () => {
    const pattern = '*://mcp.example.com/*';
    expect(matches(pattern, 'https://mcp.example.com/api')).toBe(true);
    expect(matches(pattern, 'http://mcp.example.com/api')).toBe(true);
    expect(matches(pattern, 'https://mcp.example.com:8443/api')).toBe(false);
    expect(matches(pattern, 'http://mcp.example.com:8080/api')).toBe(false);
    // 443 is the default of https, not of http.
    expect(matches(pattern, 'http://mcp.example.com:443/api')).toBe(false);
  });
});

spec(`${PAGE}.Hostname written out in full`, () => {
  test('no port: the default port only, 443 for https and 80 for http', () => {
    expect(matches('https://mcp.example.com/*', 'https://mcp.example.com/a')).toBe(true);
    expect(matches('https://mcp.example.com/*', 'https://mcp.example.com:80/a')).toBe(false);
    expect(matches('http://mcp.example.com/*', 'http://mcp.example.com/a')).toBe(true);
    expect(matches('http://mcp.example.com/*', 'http://mcp.example.com:80/a')).toBe(true);
    expect(matches('http://mcp.example.com/*', 'http://mcp.example.com:443/a')).toBe(false);
    expect(matches('http://mcp.example.com/*', 'http://mcp.example.com:8080/a')).toBe(false);
  });

  test('a host that is partly written out and partly a wildcard counts as a wildcard: every port', () => {
    expect(matches('https://mcp-*.example.com/*', 'https://mcp-eu.example.com:8443/a')).toBe(true);
    expect(matches('https://mcp-*.example.com/*', 'https://mcp-eu.example.com/a')).toBe(true);
  });
});

describe('the denylist patterns for staging.example.com', () => {
  spec(`${PAGE}.https://staging.example.com/*`, () => {
    test('blocks https servers on that host on port 443 only, not one at :8443/api', () => {
      const pattern = 'https://staging.example.com/*';
      expect(matches(pattern, 'https://staging.example.com/api')).toBe(true);
      expect(matches(pattern, 'https://staging.example.com:8443/api')).toBe(false);
    });
  });

  spec(`${PAGE}.https://staging.example.com:*/*`, () => {
    test('blocks https servers on that host on every port', () => {
      const pattern = 'https://staging.example.com:*/*';
      expect(matches(pattern, 'https://staging.example.com/api')).toBe(true);
      expect(matches(pattern, 'https://staging.example.com:8443/api')).toBe(true);
      expect(matches(pattern, 'http://staging.example.com/api')).toBe(false);
    });
  });

  spec(`${PAGE}.*://staging.example.com:*/*`, () => {
    test('blocks that host over any scheme and on any port', () => {
      const pattern = '*://staging.example.com:*/*';
      expect(matches(pattern, 'https://staging.example.com:8443/api')).toBe(true);
      expect(matches(pattern, 'http://staging.example.com/api')).toBe(true);
      expect(matches(pattern, 'ws://staging.example.com:9000/socket')).toBe(true);
      expect(matches(pattern, 'https://prod.example.com/api')).toBe(false);
    });
  });
});

// Judgments (spec/judgments.md): the docs are silent on these, so they are tested outside `spec(...)`.
describe('url pattern judgments', () => {
  test('an explicit default port is the same as no port, on the pattern and on the server', () => {
    expect(matches('https://mcp.example.com:443/*', 'https://mcp.example.com/a')).toBe(true);
    expect(matches('https://mcp.example.com/*', 'https://mcp.example.com:443/a')).toBe(true);
    expect(matches('https://mcp.example.com:80/*', 'https://mcp.example.com/a')).toBe(false);
  });

  test('the path compared is the path and query: a path without a wildcard does not match a query', () => {
    expect(matches('https://mcp.example.com/mcp', 'https://mcp.example.com/mcp?x=1')).toBe(false);
    expect(matches('https://mcp.example.com/mcp*', 'https://mcp.example.com/mcp?x=1')).toBe(true);
  });

  test('userinfo in the server URL is not part of the host', () => {
    expect(matches('https://evil.example.com/*', 'https://user@evil.example.com/a')).toBe(true);
    expect(matches('https://mcp.example.com/*', 'https://mcp.example.com@evil.com/a')).toBe(false);
  });

  test('an IPv6 host is read as a host', () => {
    expect(matches('http://[::1]:*/*', 'http://[::1]:8080/mcp')).toBe(true);
    expect(matches('http://[::1]/*', 'http://[::1]:8080/mcp')).toBe(false);
  });

  test('a pattern or a URL that does not parse matches nothing', () => {
    expect(matches('mcp.example.com/*', 'https://mcp.example.com/a')).toBe(false);
    expect(matches('https://mcp.example.com/*', 'not a url')).toBe(false);
    expect(matches('*', 'https://mcp.example.com/a')).toBe(false);
  });

  test('many wildcards stay linear', () => {
    const pattern = `https://${'*a'.repeat(40)}b.example.com/*`;
    expect(matches(pattern, `https://${'a'.repeat(200)}.example.com/x`)).toBe(false);
  });
});
