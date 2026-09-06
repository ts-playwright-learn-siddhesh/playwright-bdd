import { faker } from '@faker-js/faker';

/**
 * Run-time test data helpers.
 *
 * A .feature file often hard-codes values that must be globally unique for the
 * scenario to pass — a registration e-mail, a username, an order reference.
 * Those only work on a FIRST run; the second run collides ("already exists").
 * The .feature stays the spec; the step code swaps the literal for a fresh
 * value from here, keeping any readable prefix so the created record is still
 * recognisable.
 */

/** A unique, valid e-mail. If `seed` is a plain address its local-part
 *  (before the "@") is kept and a Date.now()+faker token is appended as an
 *  extra dotted segment: `a.b.c@example.com` -> `a.b.c.1a2b3c4d@example.com`
 *  (dotted, not "+tag", so servers that reject plus-addressing still accept
 *  it). Otherwise a fully random address is returned. */
export function uniqueEmail(seed?: string): string {
  const token = `${Date.now().toString(36)}${faker.string.alphanumeric(6).toLowerCase()}`;
  const m = seed && /^([^@\s]+)@([^@\s]+)$/.exec(seed.trim());
  if (m) return `${m[1]}.${token}@${m[2]}`;
  return `qa.${token}@example.com`;
}

/** A random but realistic person name. */
export function personName(): { first: string; last: string; full: string } {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  return { first, last, full: `${first} ${last}` };
}
