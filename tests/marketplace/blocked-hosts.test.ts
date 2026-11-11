/**
 * Judgment (spec/judgments.md, `src/marketplace/blocked-hosts.ts`): the docs name the categories
 * "loopback, link-local, or cloud-metadata host" (plugins/marketplace-reference.md, "archive plugin
 * source"), not the addresses in them, so the list is the kit's and is tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { isBlockedHost } from '../../src/marketplace/index.ts';

describe('isBlockedHost', () => {
  test('the whole 0.0.0.0/8 "this host" block is refused, not only 0.0.0.0', () => {
    for (const host of ['0.0.0.0', '0.1.2.3', '0.255.255.255']) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  test('any number of trailing dots names the same host', () => {
    for (const host of [
      'localhost.',
      'localhost..',
      '127.0.0.1..',
      'metadata.google.internal...',
    ]) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  test('public hosts and addresses pass', () => {
    for (const host of ['example.com', '10.0.0.1', '1.0.0.1', '[2001:db8::1]', 'example.com.']) {
      expect(isBlockedHost(host)).toBe(false);
    }
  });
});
