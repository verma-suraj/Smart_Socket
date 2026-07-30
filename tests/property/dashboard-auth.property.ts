import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Request, Response, NextFunction } from 'express';

/**
 * Property-based tests for Dashboard Authentication Enforcement.
 * **Validates: Requirements 14.4**
 *
 * Property 21: For any Dashboard API request that does not include valid
 * authentication credentials, the Backend SHALL reject the request with an
 * unauthorized status (401) and NOT return any system data.
 */

// ─── Mock firebase-admin ─────────────────────────────────────────────────────

const mockVerifyIdToken = vi.fn();

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

// Import after mocking
import { firebaseAuthMiddleware } from '../../src/modules/dashboard-api/auth-middleware.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Creates a mock Express Request object with optional authorization header. */
function createMockRequest(authHeader?: string): Request {
  const req = {
    headers: {} as Record<string, string | undefined>,
  } as unknown as Request;
  if (authHeader !== undefined) {
    req.headers.authorization = authHeader;
  }
  return req;
}

/** Creates a mock Express Response that captures status and json calls. */
function createMockResponse() {
  const res = {
    statusCode: 0,
    jsonBody: null as unknown,
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, body: unknown) {
      this.jsonBody = body;
      return this;
    }),
  } as unknown as Response & { statusCode: number; jsonBody: unknown };
  return res;
}

/** Creates a mock NextFunction that tracks whether it was called. */
function createMockNext(): NextFunction & { called: boolean } {
  const next = vi.fn() as unknown as NextFunction & { called: boolean };
  Object.defineProperty(next, 'called', {
    get() {
      return (next as any as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    },
  });
  return next;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates arbitrary strings that do NOT start with "Bearer " */
const nonBearerPrefixArb = fc.string({ minLength: 0, maxLength: 100 }).filter(
  (s) => !s.startsWith('Bearer ')
);

/** Generates arbitrary non-empty token strings (simulating invalid tokens) */
const invalidTokenArb = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => s.trim().length > 0
);

/** Generates arbitrary valid-looking token strings for the success path */
const validTokenArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-'),
  { minLength: 10, maxLength: 200 }
);

// ─── Property 21: Dashboard Authentication Enforcement ───────────────────────

describe('Feature: smart-socket-backend, Property 21: Dashboard Authentication Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * Sub-property 1: No auth header → 401 + { error: 'Unauthorized' }, next() NOT called
   */
  it('rejects requests with no authorization header with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(undefined),
        async () => {
          const req = createMockRequest(undefined);
          const res = createMockResponse();
          const next = createMockNext();

          await firebaseAuthMiddleware(req, res as unknown as Response, next);

          expect(res.statusCode).toBe(401);
          expect(res.jsonBody).toEqual({ error: 'Unauthorized' });
          expect(next.called).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * Sub-property 2: Auth header without "Bearer " prefix → 401 + { error: 'Unauthorized' }, next() NOT called
   */
  it('rejects requests with authorization header missing Bearer prefix with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonBearerPrefixArb,
        async (headerValue) => {
          const req = createMockRequest(headerValue);
          const res = createMockResponse();
          const next = createMockNext();

          await firebaseAuthMiddleware(req, res as unknown as Response, next);

          expect(res.statusCode).toBe(401);
          expect(res.jsonBody).toEqual({ error: 'Unauthorized' });
          expect(next.called).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * Sub-property 3: Auth header with "Bearer " but empty token → 401 + { error: 'Unauthorized' }, next() NOT called
   */
  it('rejects requests with Bearer prefix but empty token with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('Bearer '),
        async (headerValue) => {
          const req = createMockRequest(headerValue);
          const res = createMockResponse();
          const next = createMockNext();

          await firebaseAuthMiddleware(req, res as unknown as Response, next);

          expect(res.statusCode).toBe(401);
          expect(res.jsonBody).toEqual({ error: 'Unauthorized' });
          expect(next.called).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * Sub-property 4: Auth header with "Bearer " and invalid token (verifyIdToken throws) → 401 + { error: 'Unauthorized' }, next() NOT called
   */
  it('rejects requests with invalid token (verification fails) with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidTokenArb,
        async (token) => {
          mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

          const req = createMockRequest(`Bearer ${token}`);
          const res = createMockResponse();
          const next = createMockNext();

          await firebaseAuthMiddleware(req, res as unknown as Response, next);

          expect(res.statusCode).toBe(401);
          expect(res.jsonBody).toEqual({ error: 'Unauthorized' });
          expect(next.called).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * Sub-property 5: Auth header with "Bearer " and valid token (verifyIdToken succeeds) → next() IS called, req.user is set, NO 401 response
   */
  it('allows requests with valid token and sets req.user', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokenArb,
        fc.string({ minLength: 5, maxLength: 40 }).map((s) => `uid-${s}`),
        async (token, uid) => {
          const decodedToken = { uid, email: `${uid}@test.com` };
          mockVerifyIdToken.mockResolvedValueOnce(decodedToken);

          const req = createMockRequest(`Bearer ${token}`);
          const res = createMockResponse();
          const next = createMockNext();

          await firebaseAuthMiddleware(req, res as unknown as Response, next);

          // next() should be called
          expect(next.called).toBe(true);
          // req.user should be set to the decoded token
          expect(req.user).toEqual(decodedToken);
          // Response status should NOT have been set to 401
          expect(res.statusCode).not.toBe(401);
        }
      ),
      { numRuns: 100 }
    );
  });
});
