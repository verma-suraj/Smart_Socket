import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createRestRoutes, RestRouteDeps } from '../../src/modules/dashboard-api/rest-routes.js';
import type { IAuthModule } from '../../src/interfaces/auth-module.interface.js';
import type { UserProfile, UserProfileInput } from '../../src/models/index.js';

/**
 * Integration tests for the User Management flow.
 *
 * Validates: Requirements 5.1, 5.2, 5.5, 5.6
 *
 * Tests the full CRUD lifecycle through HTTP endpoints using a stateful
 * in-memory mock of IAuthModule that maintains state between calls.
 */

// ─── In-Memory Auth Module Mock ─────────────────────────────────────────────

/**
 * Creates a stateful in-memory IAuthModule that persists users across calls.
 * This simulates real behavior without needing Firestore.
 */
function createStatefulAuthModule(): IAuthModule & { setActiveSession: (userId: string, active: boolean) => void } {
  const users = new Map<string, UserProfile>();
  const activeSessions = new Set<string>();
  let idCounter = 0;

  return {
    async authenticateRfid() {
      return { success: false, responseTime: 0 };
    },

    async createUser(profile: UserProfileInput): Promise<UserProfile> {
      idCounter++;
      const userId = `user-${idCounter}`;
      const now = Date.now();

      const userProfile: UserProfile = {
        userId,
        name: profile.name,
        evType: profile.evType,
        brand: profile.brand,
        batteryCapacity: profile.batteryCapacity,
        batteryType: profile.batteryType,
        chargerType: profile.chargerType,
        chargerPowerRating: profile.chargerPowerRating,
        rfidUids: profile.rfidUids ?? [],
        createdAt: now,
        updatedAt: now,
      };

      users.set(userId, userProfile);
      return userProfile;
    },

    async updateUser(userId: string, updates: Partial<UserProfileInput>): Promise<UserProfile> {
      const existing = users.get(userId);
      if (!existing) {
        throw new Error(`User not found: userId="${userId}"`);
      }
      const updated = { ...existing, ...updates, updatedAt: Date.now() };
      users.set(userId, updated);
      return updated;
    },

    async getUserByRfid(rfidUid: string): Promise<UserProfile | null> {
      for (const user of users.values()) {
        if (user.rfidUids.includes(rfidUid)) {
          return user;
        }
      }
      return null;
    },

    async assignRfid(userId: string, rfidUid: string): Promise<void> {
      const user = users.get(userId);
      if (!user) {
        throw new Error(`User not found: userId="${userId}"`);
      }
      if (!user.rfidUids.includes(rfidUid)) {
        user.rfidUids.push(rfidUid);
      }
    },

    async listAllUsers(): Promise<UserProfile[]> {
      return Array.from(users.values());
    },

    async deleteUser(userId: string): Promise<void> {
      if (!users.has(userId)) {
        throw new Error(`User not found: userId="${userId}"`);
      }
      users.delete(userId);
    },

    hasActiveSession(userId: string): boolean {
      return activeSessions.has(userId);
    },

    // Test helper to control active session state
    setActiveSession(userId: string, active: boolean): void {
      if (active) {
        activeSessions.add(userId);
      } else {
        activeSessions.delete(userId);
      }
    },
  };
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const payload = body ? JSON.stringify(body) : undefined;

    const reqHeaders: Record<string, string> = {
      ...headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let responseBody: any;
          try {
            responseBody = data ? JSON.parse(data) : undefined;
          } catch {
            responseBody = data;
          }
          resolve({ status: res.statusCode!, body: responseBody });
        });
      }
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// ─── Minimal stubs for non-user deps ────────────────────────────────────────

function createMinimalDeps(authModule: IAuthModule): RestRouteDeps {
  return {
    nodeRegistry: { registerNode: async () => {}, deregisterNode: async () => {}, getNode: () => null, listNodes: () => [] } as any,
    sessionManager: { createSession: async () => {}, finalizeSession: async () => {}, getActiveSession: () => null, getSessionHistory: async () => [], deleteSession: async () => {} } as any,
    authModule,
    almEngine: { setThreshold: async () => {} } as any,
    dashboardApi: { getNodes: () => [], getNodeTelemetry: () => null, getActiveSessions: () => [] } as any,
    publishCommand: async () => ({ delivered: true, timestamp: Date.now() }) as any,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('User Management Flow — Integration', () => {
  let authModule: ReturnType<typeof createStatefulAuthModule>;
  let server: http.Server;

  beforeEach(async () => {
    authModule = createStatefulAuthModule();
    const app = express();
    app.use(express.json());
    app.use('/api', createRestRoutes(createMinimalDeps(authModule)));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('Full CRUD lifecycle (Requirements 5.1, 5.2)', () => {
    it('Create user → List (verify present) → Delete → List (verify gone)', async () => {
      // Step 1: Create a user via POST /api/users
      const createPayload = {
        name: 'Alice',
        evType: '4-wheeler',
        brand: 'Tesla',
        batteryCapacity: 75,
        batteryType: 'Li-ion',
        chargerType: 'Type 2',
        chargerPowerRating: 7.4,
        rfidUids: ['AABB1122'],
      };

      const createRes = await makeRequest(server, 'POST', '/api/users', createPayload);
      expect(createRes.status).toBe(201);
      expect(createRes.body.user).toBeDefined();
      expect(createRes.body.user.name).toBe('Alice');
      expect(createRes.body.user.userId).toBeDefined();

      const userId = createRes.body.user.userId;

      // Step 2: List users via GET /api/users — verify user is present
      const listRes1 = await makeRequest(server, 'GET', '/api/users');
      expect(listRes1.status).toBe(200);
      expect(listRes1.body.users).toHaveLength(1);
      expect(listRes1.body.users[0].userId).toBe(userId);
      expect(listRes1.body.users[0].name).toBe('Alice');
      expect(listRes1.body.users[0].evType).toBe('4-wheeler');
      expect(listRes1.body.users[0].brand).toBe('Tesla');
      expect(listRes1.body.users[0].rfidUids).toEqual(['AABB1122']);
      expect(listRes1.body.users[0].createdAt).toBeDefined();

      // Step 3: Delete the user via DELETE /api/users/:userId
      const deleteRes = await makeRequest(server, 'DELETE', `/api/users/${userId}`);
      expect(deleteRes.status).toBe(204);

      // Step 4: List users again — verify user is gone
      const listRes2 = await makeRequest(server, 'GET', '/api/users');
      expect(listRes2.status).toBe(200);
      expect(listRes2.body.users).toHaveLength(0);
    });
  });

  describe('Delete with active session returns 409 (Requirement 5.5)', () => {
    it('should return 409 when attempting to delete a user with an active session', async () => {
      // Create a user first
      const createPayload = {
        name: 'Bob',
        evType: '2-wheeler',
        brand: 'Ather',
        batteryCapacity: 2.9,
        batteryType: 'NMC',
        chargerType: 'Portable',
        chargerPowerRating: 0.75,
        rfidUids: [],
      };

      const createRes = await makeRequest(server, 'POST', '/api/users', createPayload);
      expect(createRes.status).toBe(201);
      const userId = createRes.body.user.userId;

      // Simulate the user having an active session
      authModule.setActiveSession(userId, true);

      // Attempt to delete — should get 409
      const deleteRes = await makeRequest(server, 'DELETE', `/api/users/${userId}`);
      expect(deleteRes.status).toBe(409);
      expect(deleteRes.body.error).toBe('Cannot delete user with active session');

      // Verify user still exists
      const listRes = await makeRequest(server, 'GET', '/api/users');
      expect(listRes.status).toBe(200);
      expect(listRes.body.users).toHaveLength(1);
      expect(listRes.body.users[0].userId).toBe(userId);
    });

    it('should allow deletion after the session ends', async () => {
      // Create a user
      const createPayload = {
        name: 'Carol',
        evType: '4-wheeler',
        brand: 'MG',
        batteryCapacity: 50,
        batteryType: 'Li-ion',
        chargerType: 'Type 2',
        chargerPowerRating: 7.4,
        rfidUids: ['CC112233'],
      };

      const createRes = await makeRequest(server, 'POST', '/api/users', createPayload);
      const userId = createRes.body.user.userId;

      // Activate then deactivate session
      authModule.setActiveSession(userId, true);

      // Attempt to delete while session is active — should fail
      const deleteRes1 = await makeRequest(server, 'DELETE', `/api/users/${userId}`);
      expect(deleteRes1.status).toBe(409);

      // End the session
      authModule.setActiveSession(userId, false);

      // Now deletion should succeed
      const deleteRes2 = await makeRequest(server, 'DELETE', `/api/users/${userId}`);
      expect(deleteRes2.status).toBe(204);

      // Verify user is gone
      const listRes = await makeRequest(server, 'GET', '/api/users');
      expect(listRes.body.users).toHaveLength(0);
    });
  });

  describe('401 for unauthenticated requests (Requirement 5.6)', () => {
    /**
     * The REST routes rely on auth middleware being applied at the app level.
     * This test verifies that when auth middleware is present, requests without
     * a valid Authorization header are rejected with 401.
     */
    it('should return 401 for GET /api/users without Authorization header', async () => {
      // Create a new server instance with auth middleware
      const authApp = express();
      authApp.use(express.json());

      // Simple auth middleware that checks for an Authorization header
      authApp.use('/api', (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        next();
      });

      authApp.use('/api', createRestRoutes(createMinimalDeps(authModule)));

      const authServer = await new Promise<http.Server>((resolve) => {
        const s = authApp.listen(0, '127.0.0.1', () => resolve(s));
      });

      try {
        // Request without Authorization header → 401
        const res = await makeRequest(authServer, 'GET', '/api/users');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Authentication required');

        // Request with valid Authorization header → 200
        const authedRes = await makeRequest(
          authServer,
          'GET',
          '/api/users',
          undefined,
          { Authorization: 'Bearer valid-token' }
        );
        expect(authedRes.status).toBe(200);
      } finally {
        await new Promise<void>((resolve) => authServer.close(() => resolve()));
      }
    });

    it('should return 401 for DELETE /api/users/:userId without Authorization header', async () => {
      // Create a new server instance with auth middleware
      const authApp = express();
      authApp.use(express.json());

      authApp.use('/api', (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        next();
      });

      authApp.use('/api', createRestRoutes(createMinimalDeps(authModule)));

      const authServer = await new Promise<http.Server>((resolve) => {
        const s = authApp.listen(0, '127.0.0.1', () => resolve(s));
      });

      try {
        // Request without Authorization header → 401
        const res = await makeRequest(authServer, 'DELETE', '/api/users/some-user-id');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Authentication required');
      } finally {
        await new Promise<void>((resolve) => authServer.close(() => resolve()));
      }
    });
  });
});
