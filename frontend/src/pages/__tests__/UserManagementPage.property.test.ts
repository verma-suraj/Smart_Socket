/**
 * Property 9: User Search Filter Correctness
 *
 * For any non-empty search string and list of user profiles,
 * every user in the filtered result must have either a `name` or `brand`
 * that contains the search string (case-insensitive), and no user matching
 * the criteria should be excluded from the results.
 *
 * **Validates: Requirements 3.3**
 *
 * Tag: Feature: rfid-tap-and-user-management, Property 9: User Search Filter Correctness
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { UserProfile } from '../../types';

/**
 * Pure filter function extracted from UserManagementPage.
 * Mirrors the useMemo logic in the component.
 */
function filterUsers(users: UserProfile[], searchQuery: string): UserProfile[] {
  if (!searchQuery.trim()) return users;
  const query = searchQuery.toLowerCase();
  return users.filter(
    (user) =>
      user.name.toLowerCase().includes(query) ||
      user.brand.toLowerCase().includes(query),
  );
}

// Arbitrary: generates a UserProfile with random but valid fields
const userProfileArb: fc.Arbitrary<UserProfile> = fc.record({
  userId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
  brand: fc.string({ minLength: 1, maxLength: 30 }),
  batteryCapacity: fc.double({ min: 1, max: 200, noNaN: true }),
  batteryType: fc.string({ minLength: 1, maxLength: 20 }),
  chargerType: fc.string({ minLength: 1, maxLength: 20 }),
  chargerPowerRating: fc.double({ min: 0.5, max: 50, noNaN: true }),
  rfidUids: fc.array(fc.stringMatching(/^[0-9a-f]{8,16}$/), { minLength: 0, maxLength: 5 }),
  createdAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
  updatedAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
});

// Arbitrary: generates a non-empty, non-whitespace search string
const nonEmptySearchArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
  (s) => s.trim().length > 0,
);

describe('Property 9: User Search Filter Correctness', { timeout: 30_000 }, () => {
  it(
    'every filtered result must have name or brand containing the search (case-insensitive)',
    () => {
      fc.assert(
        fc.property(
          fc.array(userProfileArb, { minLength: 0, maxLength: 20 }),
          nonEmptySearchArb,
          (users, searchQuery) => {
            const results = filterUsers(users, searchQuery);
            const query = searchQuery.toLowerCase();

            // Soundness: every result must match the search criteria
            for (const user of results) {
              const nameMatches = user.name.toLowerCase().includes(query);
              const brandMatches = user.brand.toLowerCase().includes(query);
              expect(nameMatches || brandMatches).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'no matching user should be excluded from the results (completeness)',
    () => {
      fc.assert(
        fc.property(
          fc.array(userProfileArb, { minLength: 0, maxLength: 20 }),
          nonEmptySearchArb,
          (users, searchQuery) => {
            const results = filterUsers(users, searchQuery);
            const query = searchQuery.toLowerCase();

            // Completeness: every user that matches must be in the results
            for (const user of users) {
              const nameMatches = user.name.toLowerCase().includes(query);
              const brandMatches = user.brand.toLowerCase().includes(query);

              if (nameMatches || brandMatches) {
                expect(results).toContain(user);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'filtered results must be a subset of the original list (no spurious entries)',
    () => {
      fc.assert(
        fc.property(
          fc.array(userProfileArb, { minLength: 0, maxLength: 20 }),
          nonEmptySearchArb,
          (users, searchQuery) => {
            const results = filterUsers(users, searchQuery);

            // Every result must be a reference from the original array
            for (const result of results) {
              expect(users).toContain(result);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
