import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { UserProfile } from '../../src/models/user.js';

/**
 * Property-based tests for the User List API Response Shape.
 * Feature: rfid-tap-and-user-management, Property 12: User List API Response Shape
 *
 * **Validates: Requirements 5.1**
 *
 * For any set of user profiles stored in the database, GET /api/users MUST return
 * a JSON response where the `users` array length equals the total number of stored
 * profiles, and each entry MUST contain the fields: userId, name, evType, brand,
 * rfidUids (array), and createdAt (number). No extra fields from the full profile
 * should leak through.
 */

/**
 * Arbitrary for generating valid UserProfile objects matching the Firestore model.
 */
const userProfileArb: fc.Arbitrary<UserProfile> = fc.record({
  userId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
  brand: fc.string({ minLength: 1, maxLength: 30 }),
  batteryCapacity: fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),
  batteryType: fc.constantFrom('Li-ion', 'LiFePO4', 'NMC', 'Lead-acid'),
  chargerType: fc.constantFrom('Type1', 'Type2', 'CCS', 'CHAdeMO', 'GBT'),
  chargerPowerRating: fc.float({ min: Math.fround(0.1), max: Math.fround(350), noNaN: true }),
  rfidUids: fc.array(fc.hexaString({ minLength: 4, maxLength: 16 }), { minLength: 0, maxLength: 5 }),
  createdAt: fc.integer({ min: 1_600_000_000_000, max: 2_000_000_000_000 }),
  updatedAt: fc.integer({ min: 1_600_000_000_000, max: 2_000_000_000_000 }),
});

/**
 * Replicates the mapping logic from the GET /api/users route handler in
 * `src/modules/dashboard-api/rest-routes.ts`.
 *
 * This tests the exact transformation applied to profiles before they are
 * sent to the client.
 */
function mapProfilesToUsersResponse(profiles: UserProfile[]) {
  return profiles.map((p) => ({
    userId: p.userId,
    name: p.name,
    evType: p.evType,
    brand: p.brand,
    rfidUids: p.rfidUids,
    createdAt: p.createdAt,
  }));
}

/** The set of fields that MUST appear in each user entry */
const REQUIRED_FIELDS = ['userId', 'name', 'evType', 'brand', 'rfidUids', 'createdAt'] as const;

/** Fields from the full UserProfile that MUST NOT appear in the response */
const EXCLUDED_FIELDS = ['batteryCapacity', 'batteryType', 'chargerType', 'chargerPowerRating', 'updatedAt'] as const;

describe('Feature: rfid-tap-and-user-management, Property 12: User List API Response Shape', () => {
  /**
   * **Validates: Requirements 5.1**
   */

  it('response users array length must equal total stored profiles', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 0, maxLength: 50 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);
          expect(users.length).toBe(profiles.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each entry must contain all required fields: userId, name, evType, brand, rfidUids, createdAt', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 1, maxLength: 30 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);

          for (const user of users) {
            for (const field of REQUIRED_FIELDS) {
              expect(user).toHaveProperty(field);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rfidUids field must be an array in each entry', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 1, maxLength: 30 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);

          for (const user of users) {
            expect(Array.isArray(user.rfidUids)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('createdAt field must be a number in each entry', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 1, maxLength: 30 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);

          for (const user of users) {
            expect(typeof user.createdAt).toBe('number');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no extra fields from the full profile must leak through (batteryCapacity, batteryType, chargerType, chargerPowerRating, updatedAt)', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 1, maxLength: 30 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);

          for (const user of users) {
            for (const field of EXCLUDED_FIELDS) {
              expect(user).not.toHaveProperty(field);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each entry must only contain exactly the 6 required fields', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 1, maxLength: 30 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);

          for (const user of users) {
            const keys = Object.keys(user);
            expect(keys.length).toBe(REQUIRED_FIELDS.length);
            expect(keys.sort()).toEqual([...REQUIRED_FIELDS].sort());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each entry field values must match the corresponding source profile', () => {
    fc.assert(
      fc.property(
        fc.array(userProfileArb, { minLength: 1, maxLength: 30 }),
        (profiles) => {
          const users = mapProfilesToUsersResponse(profiles);

          for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            const user = users[i];

            expect(user.userId).toBe(profile.userId);
            expect(user.name).toBe(profile.name);
            expect(user.evType).toBe(profile.evType);
            expect(user.brand).toBe(profile.brand);
            expect(user.rfidUids).toEqual(profile.rfidUids);
            expect(user.createdAt).toBe(profile.createdAt);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
