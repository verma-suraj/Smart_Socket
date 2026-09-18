import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { UserProfile } from '../../src/models/user.js';

/**
 * Property-based tests for User Deletion.
 * Feature: rfid-tap-and-user-management, Property 10: User Deletion Removes Profile and Frees RFIDs
 *
 * **Validates: Requirements 3.6, 5.2, 5.4**
 *
 * For any existing user ID without an active session, after calling deleteUser(userId),
 * the user MUST NOT appear in listAllUsers() results, and the deleted user's former
 * RFID UIDs MUST NOT be associated with any user (freeing them for re-assignment).
 */

// Mock the session-lifecycle module so hasActiveSession returns false (no active session)
vi.mock('../../src/modules/session-manager/session-lifecycle.js', () => ({
  getActiveSessionsMap: () => new Map(),
}));

/**
 * Creates a mock Firestore instance that simulates a collection of user documents.
 * The mock tracks document state so we can verify deletion behavior.
 */
function createMockFirestore(users: Map<string, UserProfile>) {
  const firestore = {
    collection: (collectionName: string) => {
      return {
        doc: (docId: string) => {
          return {
            id: docId,
            get: async () => {
              const user = users.get(docId);
              if (!user) {
                return { exists: false, data: () => undefined };
              }
              return { exists: true, data: () => ({ ...user }) };
            },
            set: async (data: UserProfile) => {
              users.set(docId, data);
            },
            delete: async () => {
              users.delete(docId);
            },
            update: async (data: Partial<UserProfile>) => {
              const existing = users.get(docId);
              if (existing) {
                users.set(docId, { ...existing, ...data });
              }
            },
          };
        },
        get: async () => {
          const docs = Array.from(users.entries()).map(([id, data]) => ({
            id,
            data: () => ({ ...data }),
          }));
          return { docs, empty: docs.length === 0 };
        },
        where: (field: string, op: string, value: unknown) => {
          return {
            limit: (_n: number) => ({
              get: async () => {
                const matching = Array.from(users.entries())
                  .filter(([_, user]) => {
                    if (field === 'rfidUids' && op === 'array-contains') {
                      return user.rfidUids.includes(value as string);
                    }
                    return false;
                  })
                  .map(([id, data]) => ({
                    id,
                    data: () => ({ ...data }),
                  }));
                return { docs: matching, empty: matching.length === 0 };
              },
            }),
          };
        },
      };
    },
  };

  return firestore;
}

/**
 * Arbitrary for generating a valid UserProfile with a given userId.
 */
function userProfileArb(userId: string): fc.Arbitrary<UserProfile> {
  return fc.record({
    userId: fc.constant(userId),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
    brand: fc.string({ minLength: 1, maxLength: 30 }),
    batteryCapacity: fc.double({ min: 0.1, max: 200, noNaN: true }),
    batteryType: fc.string({ minLength: 1, maxLength: 20 }),
    chargerType: fc.string({ minLength: 1, maxLength: 20 }),
    chargerPowerRating: fc.double({ min: 0.1, max: 50, noNaN: true }),
    rfidUids: fc.array(fc.hexaString({ minLength: 4, maxLength: 16 }), {
      minLength: 1,
      maxLength: 5,
    }),
    createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
    updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  });
}

describe('Feature: rfid-tap-and-user-management, Property 10: User Deletion Removes Profile and Frees RFIDs', () => {
  it('after deleteUser(userId), user must not appear in listAllUsers() and RFIDs must be freed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a target user ID (alphanumeric to avoid path issues)
        fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/),
        // Generate other user IDs for additional users in the collection
        fc.array(fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/), {
          minLength: 0,
          maxLength: 3,
        }),
        async (targetUserId, otherUserIds) => {
          // Generate a profile for the target user synchronously using fc.sample
          const [targetProfile] = fc.sample(userProfileArb(targetUserId), 1);

          // Generate profiles for other users, ensuring distinct IDs from target
          const distinctOtherIds = [...new Set(otherUserIds)].filter(
            (id) => id !== targetUserId
          );
          const otherProfiles: UserProfile[] = distinctOtherIds.map((id) => {
            const [profile] = fc.sample(userProfileArb(id), 1);
            return profile;
          });

          // Set up the mock Firestore with all users
          const usersMap = new Map<string, UserProfile>();
          usersMap.set(targetProfile.userId, targetProfile);
          for (const other of otherProfiles) {
            usersMap.set(other.userId, other);
          }

          const mockFirestore = createMockFirestore(usersMap);

          // Import and instantiate UserProfileManager with mock Firestore
          const { UserProfileManager } = await import(
            '../../src/modules/auth/user-profile.js'
          );
          const manager = new UserProfileManager(mockFirestore as any);

          // Capture the RFID UIDs before deletion
          const formerRfidUids = [...targetProfile.rfidUids];

          // Act: delete the target user (no active session due to mock)
          await manager.deleteUser(targetUserId);

          // Assert 1: User must NOT appear in listAllUsers()
          const allUsers = await manager.listAllUsers();
          const deletedUserStillPresent = allUsers.some(
            (u: UserProfile) => u.userId === targetUserId
          );
          expect(deletedUserStillPresent).toBe(false);

          // Assert 2: Former RFID UIDs must NOT be associated with any user
          // (unless another user coincidentally has the same UID)
          for (const rfidUid of formerRfidUids) {
            const otherUserHasSameUid = otherProfiles.some((u) =>
              u.rfidUids.includes(rfidUid)
            );
            if (!otherUserHasSameUid) {
              const userByRfid = await manager.getUserByRfid(rfidUid);
              expect(userByRfid).toBeNull();
            }
          }

          // Assert 3: Other users remain unaffected
          for (const other of otherProfiles) {
            const found = allUsers.some(
              (u: UserProfile) => u.userId === other.userId
            );
            expect(found).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Property 11: Delete Blocked When User Has Active Session ─────────────────

describe('Feature: rfid-tap-and-user-management, Property 11: Delete Blocked When User Has Active Session', () => {
  /**
   * **Validates: Requirements 5.5**
   *
   * For any user ID that has an active charging session, attempting to delete
   * that user MUST fail with a 409 status and the user profile MUST remain
   * unchanged in the database.
   */

  it('DELETE /api/users/:userId returns 409 when user has active session and does not delete the user', async () => {
    // We need to unmock session-lifecycle for this test block to simulate active sessions
    // Instead, we test at the REST route level where hasActiveSession is called on authModule

    const { createRestRoutes } = await import(
      '../../src/modules/dashboard-api/rest-routes.js'
    );
    const express = (await import('express')).default;
    const { default: request } = await import('supertest');

    await fc.assert(
      fc.asyncProperty(
        // Generate a user profile
        fc.record({
          userId: fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/),
          name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
          brand: fc.string({ minLength: 1, maxLength: 30 }),
          batteryCapacity: fc.double({ min: 0.1, max: 200, noNaN: true }),
          batteryType: fc.string({ minLength: 1, maxLength: 20 }),
          chargerType: fc.string({ minLength: 1, maxLength: 20 }),
          chargerPowerRating: fc.double({ min: 0.1, max: 50, noNaN: true }),
          rfidUids: fc.array(fc.hexaString({ minLength: 4, maxLength: 16 }), {
            minLength: 0,
            maxLength: 5,
          }),
          createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
        }),
        async (userProfile) => {
          // Track whether deleteUser was called
          const deleteUserFn = vi.fn().mockResolvedValue(undefined);

          // authModule mock where hasActiveSession always returns true for this user
          const authModule = {
            authenticateRfid: vi.fn().mockResolvedValue({ success: true, responseTime: 10 }),
            createUser: vi.fn().mockResolvedValue({}),
            updateUser: vi.fn().mockResolvedValue({}),
            getUserByRfid: vi.fn().mockResolvedValue(null),
            assignRfid: vi.fn().mockResolvedValue(undefined),
            listAllUsers: vi.fn().mockResolvedValue([userProfile]),
            deleteUser: deleteUserFn,
            hasActiveSession: (userId: string) => userId === userProfile.userId,
          };

          const deps = {
            nodeRegistry: {
              registerNode: vi.fn(),
              deregisterNode: vi.fn(),
              getNode: vi.fn(),
              getAllNodes: vi.fn(),
              updateNodeStatus: vi.fn(),
            } as any,
            sessionManager: {
              createSession: vi.fn(),
              getActiveSession: vi.fn(),
              finalizeSession: vi.fn(),
              getSessionHistory: vi.fn(),
              deleteSession: vi.fn(),
            } as any,
            authModule: authModule as any,
            almEngine: { setThreshold: vi.fn() } as any,
            dashboardApi: {
              getNodes: vi.fn().mockReturnValue([]),
              getNodeTelemetry: vi.fn(),
              getActiveSessions: vi.fn().mockReturnValue([]),
            } as any,
            publishCommand: vi.fn().mockResolvedValue({ delivered: true }),
          };

          const app = express();
          app.use(express.json());
          app.use('/api', createRestRoutes(deps));

          // Attempt to delete user with active session
          const response = await request(app).delete(`/api/users/${userProfile.userId}`);

          // Must return 409
          expect(response.status).toBe(409);
          expect(response.body.error).toContain('active session');

          // deleteUser must NOT have been called — user remains unchanged
          expect(deleteUserFn).not.toHaveBeenCalled();

          // Verify user is still in the list (unchanged)
          const listResponse = await request(app).get('/api/users');
          expect(listResponse.status).toBe(200);
          const foundUser = listResponse.body.users.find(
            (u: any) => u.userId === userProfile.userId
          );
          expect(foundUser).toBeDefined();
          expect(foundUser.name).toBe(userProfile.name);
          expect(foundUser.evType).toBe(userProfile.evType);
          expect(foundUser.brand).toBe(userProfile.brand);
          expect(foundUser.rfidUids).toEqual(userProfile.rfidUids);
          expect(foundUser.createdAt).toBe(userProfile.createdAt);
        }
      ),
      { numRuns: 100 }
    );
  });
});
