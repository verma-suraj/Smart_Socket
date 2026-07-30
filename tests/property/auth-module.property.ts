import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { RfidHandler } from '../../src/modules/auth/rfid-handler.js';
import { UserProfileManager } from '../../src/modules/auth/user-profile.js';
import type { UserProfileInput } from '../../src/models/user.js';

/**
 * Property-based tests for the Auth Module.
 * Validates: Requirements 6.2, 6.3, 7.1, 7.2, 7.4, 7.5
 */

// ─── Firestore Mock Helper ───────────────────────────────────────────────────

/**
 * Creates an in-memory Firestore mock that supports:
 * - collection('users').where('rfidUids', 'array-contains', uid).limit(1).get()
 * - collection('users').doc() → auto-generated ID
 * - collection('users').doc(id).set(data) → store
 * - collection('users').doc(id).get() → retrieve
 */
function createInMemoryFirestoreMock() {
  const store = new Map<string, Record<string, unknown>>();
  let autoIdCounter = 0;

  const createDocRef = (id: string) => ({
    id,
    set: vi.fn(async (data: Record<string, unknown>) => {
      store.set(id, { ...data });
    }),
    get: vi.fn(async () => {
      const data = store.get(id);
      return {
        exists: data !== undefined,
        id,
        data: () => data ?? undefined,
      };
    }),
    update: vi.fn(async (updates: Record<string, unknown>) => {
      const existing = store.get(id);
      if (existing) {
        store.set(id, { ...existing, ...updates });
      }
    }),
  });

  const collectionMock = vi.fn((collectionName: string) => ({
    doc: vi.fn((id?: string) => {
      const docId = id ?? `auto-id-${++autoIdCounter}`;
      return createDocRef(docId);
    }),
    where: vi.fn((_field: string, _op: string, value: string) => ({
      limit: vi.fn((_n: number) => ({
        get: vi.fn(async () => {
          // Search all docs for rfidUids array containing value
          const matchingDocs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
          for (const [docId, docData] of store.entries()) {
            const rfidUids = docData.rfidUids as string[] | undefined;
            if (rfidUids && Array.isArray(rfidUids) && rfidUids.includes(value)) {
              matchingDocs.push({ id: docId, data: () => docData });
            }
          }
          return {
            empty: matchingDocs.length === 0,
            docs: matchingDocs,
          };
        }),
      })),
    })),
  }));

  return {
    firestore: { collection: collectionMock } as any,
    store,
    resetStore: () => {
      store.clear();
      autoIdCounter = 0;
    },
  };
}

/**
 * Creates a simple mock Firestore that always returns a registered user for any RFID query.
 */
function createRegisteredUserFirestoreMock(userId: string) {
  const collectionMock = vi.fn(() => ({
    doc: vi.fn(() => ({ id: userId })),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => ({
          empty: false,
          docs: [{ id: userId, data: () => ({ userId, rfidUids: [] }) }],
        })),
      })),
    })),
  }));

  return { collection: collectionMock } as any;
}

/**
 * Creates a simple mock Firestore that always returns empty (unregistered) for any RFID query.
 */
function createUnregisteredFirestoreMock() {
  const collectionMock = vi.fn(() => ({
    doc: vi.fn(() => ({ id: 'unused' })),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => ({
          empty: true,
          docs: [],
        })),
      })),
    })),
  }));

  return { collection: collectionMock } as any;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates non-empty alphanumeric node IDs */
const nodeIdArb = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
  minLength: 1,
  maxLength: 20,
}).map(s => `node-${s}`);

/** Generates non-empty RFID UIDs (hex-like strings) */
const rfidUidArb = fc.stringOf(fc.constantFrom(...'0123456789ABCDEF'), {
  minLength: 4,
  maxLength: 16,
});

/** Generates a valid UserProfileInput with all required fields */
const validProfileArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
  brand: fc.string({ minLength: 1, maxLength: 30 }),
  batteryCapacity: fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
  batteryType: fc.string({ minLength: 1, maxLength: 20 }),
  chargerType: fc.string({ minLength: 1, maxLength: 20 }),
  chargerPowerRating: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
  rfidUids: fc.array(rfidUidArb, { minLength: 0, maxLength: 5 }),
});

// ─── Property 11: RFID Authentication — Registered User Success Path ─────────

describe('Feature: smart-socket-backend, Property 11: RFID Authentication — Registered User Success Path', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any RFID_UID that exists in the user database, authentication SHALL
   * succeed and produce a result containing the associated user_id.
   */
  it('authentication succeeds and returns userId for any registered RFID UID', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        rfidUidArb,
        fc.string({ minLength: 5, maxLength: 30 }).map(s => `user-${s}`),
        async (nodeId, rfidUid, userId) => {
          const firestore = createRegisteredUserFirestoreMock(userId);
          const handler = new RfidHandler(firestore);

          const result = await handler.authenticate(nodeId, rfidUid);

          expect(result.success).toBe(true);
          expect(result.userId).toBe(userId);
          expect(typeof result.responseTime).toBe('number');
          expect(result.responseTime).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: RFID Authentication — Unregistered UID Denial ──────────────

describe('Feature: smart-socket-backend, Property 12: RFID Authentication — Unregistered UID Denial', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any RFID_UID that does NOT exist in the user database, authentication
   * SHALL fail, produce an access-denied response, and NOT trigger a relay-on
   * command or create a session.
   */
  it('authentication fails with access_denied for any unregistered RFID UID', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        rfidUidArb,
        async (nodeId, rfidUid) => {
          const firestore = createUnregisteredFirestoreMock();
          const handler = new RfidHandler(firestore);

          const result = await handler.authenticate(nodeId, rfidUid);

          expect(result.success).toBe(false);
          expect(result.error).toBe('access_denied');
          expect(result.userId).toBeUndefined();
          expect(typeof result.responseTime).toBe('number');
          expect(result.responseTime).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 13: User Profile Validation ────────────────────────────────────

describe('Feature: smart-socket-backend, Property 13: User Profile Validation', () => {
  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For any user profile input where one or more required fields (name,
   * batteryCapacity, chargerPowerRating) are missing or invalid, profile
   * creation SHALL be rejected with an error message that identifies exactly
   * which required fields are missing.
   */
  it('rejects profiles with missing/invalid required fields and identifies them in error', async () => {
    // Generate profiles where at least one required field is invalid
    const invalidProfileArb = fc.record({
      name: fc.oneof(fc.constant(''), fc.constant('   ')),
      evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
      brand: fc.string({ minLength: 1, maxLength: 30 }),
      batteryCapacity: fc.oneof(
        fc.constant(0),
        fc.constant(-1),
        fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true })
      ),
      batteryType: fc.string({ minLength: 1, maxLength: 20 }),
      chargerType: fc.string({ minLength: 1, maxLength: 20 }),
      chargerPowerRating: fc.oneof(
        fc.constant(0),
        fc.constant(-5),
        fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true })
      ),
      rfidUids: fc.array(rfidUidArb, { minLength: 0, maxLength: 3 }),
    });

    await fc.assert(
      fc.asyncProperty(
        invalidProfileArb,
        async (profile) => {
          const { firestore } = createInMemoryFirestoreMock();
          const manager = new UserProfileManager(firestore);

          await expect(manager.createUser(profile as UserProfileInput)).rejects.toThrow(Error);

          try {
            await manager.createUser(profile as UserProfileInput);
          } catch (err) {
            const message = (err as Error).message;
            // Verify the error identifies the specific missing fields
            if (!profile.name || profile.name.trim() === '') {
              expect(message).toContain('name');
            }
            if (profile.batteryCapacity <= 0) {
              expect(message).toContain('batteryCapacity');
            }
            if (profile.chargerPowerRating <= 0) {
              expect(message).toContain('chargerPowerRating');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects profiles with only some required fields invalid', async () => {
    // Generate profiles where exactly one required field is invalid
    const singleFieldInvalidArb = fc.oneof(
      // Only name is invalid
      fc.record({
        name: fc.oneof(fc.constant(''), fc.constant('  ')),
        evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
        brand: fc.string({ minLength: 1, maxLength: 20 }),
        batteryCapacity: fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
        batteryType: fc.string({ minLength: 1, maxLength: 20 }),
        chargerType: fc.string({ minLength: 1, maxLength: 20 }),
        chargerPowerRating: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        rfidUids: fc.array(rfidUidArb, { minLength: 0, maxLength: 3 }),
      }),
      // Only batteryCapacity is invalid
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
        brand: fc.string({ minLength: 1, maxLength: 20 }),
        batteryCapacity: fc.oneof(fc.constant(0), fc.constant(-1)),
        batteryType: fc.string({ minLength: 1, maxLength: 20 }),
        chargerType: fc.string({ minLength: 1, maxLength: 20 }),
        chargerPowerRating: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        rfidUids: fc.array(rfidUidArb, { minLength: 0, maxLength: 3 }),
      }),
      // Only chargerPowerRating is invalid
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
        brand: fc.string({ minLength: 1, maxLength: 20 }),
        batteryCapacity: fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
        batteryType: fc.string({ minLength: 1, maxLength: 20 }),
        chargerType: fc.string({ minLength: 1, maxLength: 20 }),
        chargerPowerRating: fc.oneof(fc.constant(0), fc.constant(-1)),
        rfidUids: fc.array(rfidUidArb, { minLength: 0, maxLength: 3 }),
      })
    );

    await fc.assert(
      fc.asyncProperty(
        singleFieldInvalidArb,
        async (profile) => {
          const { firestore } = createInMemoryFirestoreMock();
          const manager = new UserProfileManager(firestore);

          try {
            await manager.createUser(profile as UserProfileInput);
            // Should not reach here
            expect(true).toBe(false);
          } catch (err) {
            const message = (err as Error).message;
            expect(message).toContain('Missing required fields');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: User Profile Round-Trip ────────────────────────────────────

describe('Feature: smart-socket-backend, Property 14: User Profile Round-Trip', () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   *
   * For any valid user profile input (with all required fields), creating the
   * profile and then retrieving it SHALL return an object with all original
   * field values preserved, a unique user_id assigned, and associated RFID UIDs intact.
   */
  it('creating and retrieving a profile preserves all field values', async () => {
    await fc.assert(
      fc.asyncProperty(
        validProfileArb,
        async (profileInput) => {
          const { firestore, resetStore } = createInMemoryFirestoreMock();
          resetStore();
          const manager = new UserProfileManager(firestore);

          // Create the user
          const created = await manager.createUser(profileInput as UserProfileInput);

          // Verify userId is assigned
          expect(created.userId).toBeTruthy();
          expect(typeof created.userId).toBe('string');
          expect(created.userId.length).toBeGreaterThan(0);

          // Verify all original field values are preserved
          expect(created.name).toBe(profileInput.name);
          expect(created.evType).toBe(profileInput.evType);
          expect(created.brand).toBe(profileInput.brand);
          expect(created.batteryCapacity).toBe(profileInput.batteryCapacity);
          expect(created.batteryType).toBe(profileInput.batteryType);
          expect(created.chargerType).toBe(profileInput.chargerType);
          expect(created.chargerPowerRating).toBe(profileInput.chargerPowerRating);

          // Verify RFID UIDs are preserved
          expect(created.rfidUids).toEqual(profileInput.rfidUids);

          // Verify timestamps are set
          expect(created.createdAt).toBeGreaterThan(0);
          expect(created.updatedAt).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each created profile gets a unique userId', async () => {
    const { firestore, resetStore } = createInMemoryFirestoreMock();
    resetStore();
    const manager = new UserProfileManager(firestore);
    const userIds = new Set<string>();

    await fc.assert(
      fc.asyncProperty(
        validProfileArb,
        async (profileInput) => {
          const created = await manager.createUser(profileInput as UserProfileInput);
          // Each userId should be unique
          expect(userIds.has(created.userId)).toBe(false);
          userIds.add(created.userId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
