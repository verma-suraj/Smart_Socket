import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { createRestRoutes, RestRouteDeps } from '../../src/modules/dashboard-api/rest-routes.js';

/**
 * Unit tests for user-related REST routes (GET /api/users, DELETE /api/users/:userId).
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6
 */

/** Helper: creates a mock RestRouteDeps with all methods stubbed. */
function createMockDeps(): RestRouteDeps {
  return {
    nodeRegistry: {
      registerNode: vi.fn(),
      deregisterNode: vi.fn(),
      getNode: vi.fn(),
      listNodes: vi.fn(),
    } as any,
    sessionManager: {
      createSession: vi.fn(),
      finalizeSession: vi.fn(),
      getActiveSession: vi.fn(),
      getSessionHistory: vi.fn(),
      deleteSession: vi.fn(),
    } as any,
    authModule: {
      authenticateRfid: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      getUserByRfid: vi.fn(),
      assignRfid: vi.fn(),
      listAllUsers: vi.fn(),
      deleteUser: vi.fn(),
      hasActiveSession: vi.fn(),
    } as any,
    almEngine: {
      setThreshold: vi.fn(),
    } as any,
    dashboardApi: {
      getNodes: vi.fn(),
      getNodeTelemetry: vi.fn(),
      getActiveSessions: vi.fn(),
    } as any,
    publishCommand: vi.fn(),
  };
}

/** Helper: makes an HTTP request to the test server and returns { status, body }. */
function makeRequest(
  server: http.Server,
  method: string,
  path: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const req = http.request(
      { hostname: '127.0.0.1', port: address.port, method, path },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any;
          try {
            body = data ? JSON.parse(data) : undefined;
          } catch {
            body = data;
          }
          resolve({ status: res.statusCode!, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('REST Routes — Users', () => {
  let deps: RestRouteDeps;
  let server: http.Server;

  beforeEach(async () => {
    deps = createMockDeps();
    const app = express();
    app.use(express.json());
    app.use('/api', createRestRoutes(deps));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('GET /api/users', () => {
    it('should return 200 with correctly shaped user list', async () => {
      const mockProfiles = [
        {
          userId: 'user-1',
          name: 'Alice',
          evType: '4-wheeler',
          brand: 'Tesla',
          batteryCapacity: 75,
          batteryType: 'Li-ion',
          chargerType: 'Type 2',
          chargerPowerRating: 7.4,
          rfidUids: ['RFID_A'],
          createdAt: 1700000000000,
          updatedAt: 1700000001000,
        },
        {
          userId: 'user-2',
          name: 'Bob',
          evType: '2-wheeler',
          brand: 'Ather',
          batteryCapacity: 2.9,
          batteryType: 'NMC',
          chargerType: 'Portable',
          chargerPowerRating: 0.75,
          rfidUids: [],
          createdAt: 1700000002000,
          updatedAt: 1700000003000,
        },
      ];

      (deps.authModule.listAllUsers as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfiles);

      const { status, body } = await makeRequest(server, 'GET', '/api/users');

      expect(status).toBe(200);
      expect(body.users).toHaveLength(2);

      // Verify correct shape: only userId, name, evType, brand, rfidUids, createdAt
      expect(body.users[0]).toEqual({
        userId: 'user-1',
        name: 'Alice',
        evType: '4-wheeler',
        brand: 'Tesla',
        rfidUids: ['RFID_A'],
        createdAt: 1700000000000,
      });

      expect(body.users[1]).toEqual({
        userId: 'user-2',
        name: 'Bob',
        evType: '2-wheeler',
        brand: 'Ather',
        rfidUids: [],
        createdAt: 1700000002000,
      });

      // Verify sensitive/internal fields are NOT exposed
      expect(body.users[0]).not.toHaveProperty('batteryCapacity');
      expect(body.users[0]).not.toHaveProperty('batteryType');
      expect(body.users[0]).not.toHaveProperty('chargerType');
      expect(body.users[0]).not.toHaveProperty('chargerPowerRating');
      expect(body.users[0]).not.toHaveProperty('updatedAt');
    });

    it('should return 500 when listAllUsers throws', async () => {
      (deps.authModule.listAllUsers as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { status, body } = await makeRequest(server, 'GET', '/api/users');

      expect(status).toBe(500);
      expect(body.error).toBe('Failed to retrieve users');
    });
  });

  describe('DELETE /api/users/:userId', () => {
    it('should return 409 when user has an active session', async () => {
      (deps.authModule.hasActiveSession as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const { status, body } = await makeRequest(server, 'DELETE', '/api/users/user-1');

      expect(status).toBe(409);
      expect(body.error).toBe('Cannot delete user with active session');
      expect(deps.authModule.deleteUser).not.toHaveBeenCalled();
    });

    it('should return 404 when deleteUser throws "User not found"', async () => {
      (deps.authModule.hasActiveSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (deps.authModule.deleteUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('User not found: userId="user-nonexistent"')
      );

      const { status, body } = await makeRequest(server, 'DELETE', '/api/users/user-nonexistent');

      expect(status).toBe(404);
      expect(body.error).toBe('User not found');
    });

    it('should return 204 on successful deletion', async () => {
      (deps.authModule.hasActiveSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (deps.authModule.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { status } = await makeRequest(server, 'DELETE', '/api/users/user-1');

      expect(status).toBe(204);
      expect(deps.authModule.hasActiveSession).toHaveBeenCalledWith('user-1');
      expect(deps.authModule.deleteUser).toHaveBeenCalledWith('user-1');
    });

    it('should return 500 when deleteUser throws a non-404 error', async () => {
      (deps.authModule.hasActiveSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (deps.authModule.deleteUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Firestore write failed')
      );

      const { status, body } = await makeRequest(server, 'DELETE', '/api/users/user-1');

      expect(status).toBe(500);
      expect(body.error).toBe('Failed to delete user');
    });
  });
});
