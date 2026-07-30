import { describe, it, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property-based test for auth token attachment.
 * Validates: Requirements 1.2
 *
 * Property 1: Auth token attachment
 * For any API request configuration (any URL path, any HTTP method),
 * when the auth store has a valid token, the resulting request headers
 * SHALL contain `Authorization: Bearer {token}`.
 */

// Mock Firebase before importing modules that depend on it
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

// Now import the api instance and auth store after mocks are set up
import { api } from '../../src/services/api.service';
import { useAuthStore } from '../../src/stores/auth.store';

describe('Feature: smart-socket-dashboard, Property 1: Auth token attachment', () => {
  beforeEach(() => {
    // Reset auth store state before each test
    useAuthStore.setState({ user: null, token: null, loading: false, error: null });
  });

  it('any request with a valid token gets Authorization: Bearer {token} header', () => {
    // Get the request interceptor handler
    // Axios stores interceptors as an array of { fulfilled, rejected } objects
    const interceptorHandlers = (api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (config: Record<string, unknown>) => Record<string, unknown> }> }).handlers;
    const requestInterceptor = interceptorHandlers.find((h) => h.fulfilled !== null);

    if (!requestInterceptor) {
      throw new Error('Request interceptor not found');
    }

    const { fulfilled: interceptorFn } = requestInterceptor;

    // Arbitrary for non-empty token strings (valid tokens are non-empty)
    const tokenArb = fc.string({ minLength: 1, maxLength: 500 });

    // Arbitrary for URL paths
    const pathArb = fc.string({ minLength: 1, maxLength: 200 }).map((s) => '/' + s);

    // Arbitrary for HTTP methods
    const methodArb = fc.constantFrom('get', 'post', 'put', 'patch', 'delete', 'head', 'options');

    fc.assert(
      fc.property(tokenArb, pathArb, methodArb, (token, url, method) => {
        // Set the token in the auth store
        useAuthStore.setState({ token });

        // Create a mock request config with headers object
        const config = {
          url,
          method,
          headers: {
            Authorization: undefined as string | undefined,
          },
        };

        // Run the interceptor
        const result = interceptorFn(config) as { headers: { Authorization?: string } };

        // Verify the Authorization header is attached
        return result.headers.Authorization === `Bearer ${token}`;
      }),
      { numRuns: 100 }
    );
  });

  it('request without a token does NOT attach Authorization header', () => {
    const interceptorHandlers = (api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (config: Record<string, unknown>) => Record<string, unknown> }> }).handlers;
    const requestInterceptor = interceptorHandlers.find((h) => h.fulfilled !== null);

    if (!requestInterceptor) {
      throw new Error('Request interceptor not found');
    }

    const { fulfilled: interceptorFn } = requestInterceptor;

    // Arbitrary for URL paths
    const pathArb = fc.string({ minLength: 1, maxLength: 200 }).map((s) => '/' + s);

    // Arbitrary for HTTP methods
    const methodArb = fc.constantFrom('get', 'post', 'put', 'patch', 'delete', 'head', 'options');

    fc.assert(
      fc.property(pathArb, methodArb, (url, method) => {
        // Ensure no token is set
        useAuthStore.setState({ token: null });

        const config = {
          url,
          method,
          headers: {} as Record<string, string | undefined>,
        };

        // Run the interceptor
        const result = interceptorFn(config) as { headers: Record<string, string | undefined> };

        // Verify no Authorization header is set
        return result.headers.Authorization === undefined;
      }),
      { numRuns: 100 }
    );
  });
});
