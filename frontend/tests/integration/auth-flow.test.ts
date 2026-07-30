import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';

/**
 * Integration tests for auth flow and WebSocket lifecycle.
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 2.1, 2.3, 2.4, 2.5
 *
 * Tests cover:
 * 1. Login flow: authenticate → token stored in AuthStore → API requests get Bearer header
 * 2. Logout flow: clear tokens → WebSocket disconnects → redirect to login
 * 3. Token refresh: when token changes, new requests use updated token
 * 4. 401 response: clears tokens and redirects to /login with session expired message
 * 5. WebSocket lifecycle: connects on auth success, disconnects on logout
 */

// Mock Firebase config before any store imports
vi.mock('../../src/config/firebase', () => ({
  auth: { currentUser: null },
  default: {},
}));

// Mock the auth service to prevent Firebase initialization
vi.mock('../../src/services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn(),
    onAuthStateChanged: vi.fn(() => () => {}),
  },
}));

// Mock WebSocket service
vi.mock('../../src/services/websocket.service', () => {
  let messageHandler: ((msg: unknown) => void) | null = null;
  return {
    webSocketService: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onMessage: vi.fn((handler: (msg: unknown) => void) => {
        messageHandler = handler;
      }),
      getStatus: vi.fn(() => 'connected' as const),
      __simulateMessage: (msg: unknown) => {
        if (messageHandler) messageHandler(msg);
      },
      __resetHandler: () => {
        messageHandler = null;
      },
    },
  };
});

import { useAuthStore } from '../../src/stores/auth.store';
import { useUIStore } from '../../src/stores/ui.store';
import { api } from '../../src/services/api.service';
import { webSocketService } from '../../src/services/websocket.service';
import { authService } from '../../src/services/auth.service';
import { useWebSocketIntegration } from '../../src/hooks/useWebSocketIntegration';
import type { User } from 'firebase/auth';

const mockWs = webSocketService as unknown as typeof webSocketService & {
  __simulateMessage: (msg: unknown) => void;
  __resetHandler: () => void;
};

describe('Auth Flow Integration', () => {
  let originalLocationHref: string;

  beforeEach(() => {
    // Reset stores
    useAuthStore.setState({ user: null, token: null, loading: false, error: null });
    useUIStore.setState({ notifications: [], connectionStatus: 'disconnected', eventLog: [] });

    // Mock window.location
    originalLocationHref = window.location.href;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    vi.clearAllMocks();
    mockWs.__resetHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Login flow: authenticate → token stored → API has Bearer header', () => {
    it('should store user and token in AuthStore after successful login', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com' } as unknown as User;
      vi.mocked(authService.login).mockResolvedValue(mockUser);
      vi.mocked(authService.getToken).mockResolvedValue('firebase-id-token-abc');

      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'password123');
      });

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe('firebase-id-token-abc');
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should attach Bearer token to API request headers via interceptor', async () => {
      // Set token in auth store (simulating post-login state)
      useAuthStore.setState({ token: 'my-bearer-token' });

      // Extract the request interceptor to test it
      const interceptorHandlers = (
        api.interceptors.request as unknown as {
          handlers: Array<{ fulfilled: ((config: unknown) => unknown) | null }>;
        }
      ).handlers;
      const requestInterceptor = interceptorHandlers.find((h) => h.fulfilled !== null);
      expect(requestInterceptor?.fulfilled).toBeDefined();

      // Simulate a request config
      const mockConfig = { headers: {} as Record<string, string> };
      const result = await (requestInterceptor!.fulfilled as (config: unknown) => unknown)(mockConfig) as typeof mockConfig;

      expect(result.headers.Authorization).toBe('Bearer my-bearer-token');
    });

    it('should NOT attach Authorization header when no token is present', async () => {
      // Ensure no token
      useAuthStore.setState({ token: null });

      const interceptorHandlers = (
        api.interceptors.request as unknown as {
          handlers: Array<{ fulfilled: ((config: unknown) => unknown) | null }>;
        }
      ).handlers;
      const requestInterceptor = interceptorHandlers.find((h) => h.fulfilled !== null);

      const mockConfig = { headers: {} as Record<string, string> };
      const result = await (requestInterceptor!.fulfilled as (config: unknown) => unknown)(mockConfig) as typeof mockConfig;

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should set loading state during login and clear it on success', async () => {
      const mockUser = { uid: 'user-123' } as unknown as User;
      vi.mocked(authService.login).mockImplementation(() => {
        // Verify loading is true while awaiting
        expect(useAuthStore.getState().loading).toBe(true);
        return Promise.resolve(mockUser);
      });
      vi.mocked(authService.getToken).mockResolvedValue('token-xyz');

      await act(async () => {
        await useAuthStore.getState().login('user@test.com', 'pass');
      });

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('should store error message on login failure', async () => {
      vi.mocked(authService.login).mockRejectedValue(new Error('Invalid credentials'));

      await act(async () => {
        try {
          await useAuthStore.getState().login('bad@test.com', 'wrong');
        } catch {
          // Expected to throw
        }
      });

      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid credentials');
      expect(state.loading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });
  });

  describe('Logout flow: clear tokens → WS disconnects → redirect', () => {
    it('should clear user and token from AuthStore on logout', async () => {
      // Start in authenticated state
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });
      vi.mocked(authService.logout).mockResolvedValue(undefined);

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });

    it('should disconnect WebSocket when user logs out', () => {
      // Start authenticated → WebSocket connected
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });

      const { rerender } = renderHook(() => useWebSocketIntegration());
      expect(webSocketService.connect).toHaveBeenCalledTimes(1);

      // Simulate logout
      act(() => {
        useAuthStore.setState({ user: null, token: null });
      });
      rerender();

      expect(webSocketService.disconnect).toHaveBeenCalled();
    });

    it('should clear tokens even if authService.logout throws', async () => {
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });
      vi.mocked(authService.logout).mockRejectedValue(new Error('Network error'));

      await act(async () => {
        // logout() uses try/finally so tokens are always cleared,
        // but the rejected promise propagates
        try {
          await useAuthStore.getState().logout();
        } catch {
          // Expected: authService.logout threw
        }
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });
  });

  describe('Token refresh: updated token used in subsequent requests', () => {
    it('should use the updated token when token changes in store', async () => {
      // Initial token
      useAuthStore.setState({ token: 'initial-token' });

      const interceptorHandlers = (
        api.interceptors.request as unknown as {
          handlers: Array<{ fulfilled: ((config: unknown) => unknown) | null }>;
        }
      ).handlers;
      const requestInterceptor = interceptorHandlers.find((h) => h.fulfilled !== null);

      // First request uses initial token
      const config1 = { headers: {} as Record<string, string> };
      const result1 = await (requestInterceptor!.fulfilled as (config: unknown) => unknown)(config1) as typeof config1;
      expect(result1.headers.Authorization).toBe('Bearer initial-token');

      // Token is refreshed
      act(() => {
        useAuthStore.setState({ token: 'refreshed-token' });
      });

      // Next request should use the new token
      const config2 = { headers: {} as Record<string, string> };
      const result2 = await (requestInterceptor!.fulfilled as (config: unknown) => unknown)(config2) as typeof config2;
      expect(result2.headers.Authorization).toBe('Bearer refreshed-token');
    });

    it('should reflect token updates via setToken', () => {
      useAuthStore.getState().setToken('new-token-123');
      expect(useAuthStore.getState().token).toBe('new-token-123');

      useAuthStore.getState().setToken('another-token');
      expect(useAuthStore.getState().token).toBe('another-token');
    });
  });

  describe('401 response: clears tokens and redirects to /login', () => {
    let errorHandler: (error: unknown) => unknown;

    beforeEach(() => {
      // Set up authenticated state
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });

      // Extract the response error interceptor
      const interceptorHandlers = (
        api.interceptors.response as unknown as {
          handlers: Array<{ rejected: ((error: unknown) => unknown) | null }>;
        }
      ).handlers;
      const responseInterceptor = interceptorHandlers.find((h) => h.rejected !== null);
      if (!responseInterceptor?.rejected) {
        throw new Error('Response error interceptor not found');
      }
      errorHandler = responseInterceptor.rejected;
    });

    it('should clear tokens on 401 response', async () => {
      const headers = new AxiosHeaders();
      const error401 = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });

      await expect(errorHandler(error401)).rejects.toBeDefined();

      const authState = useAuthStore.getState();
      expect(authState.token).toBeNull();
      expect(authState.user).toBeNull();
    });

    it('should redirect to /login on 401 response', async () => {
      const headers = new AxiosHeaders();
      const error401 = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });

      await expect(errorHandler(error401)).rejects.toBeDefined();

      expect(window.location.href).toBe('/login');
    });

    it('should show session expired notification on 401 response', async () => {
      const headers = new AxiosHeaders();
      const error401 = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });

      await expect(errorHandler(error401)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Session Expired');
      expect(notifications[0].message).toContain('session has expired');
      expect(notifications[0].type).toBe('error');
    });
  });

  describe('WebSocket lifecycle: connects on auth, disconnects on logout', () => {
    it('should NOT connect WebSocket when user is not authenticated', () => {
      useAuthStore.setState({ user: null, token: null });
      renderHook(() => useWebSocketIntegration());
      expect(webSocketService.connect).not.toHaveBeenCalled();
    });

    it('should connect WebSocket when user authenticates', () => {
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });

      renderHook(() => useWebSocketIntegration());

      expect(webSocketService.connect).toHaveBeenCalledTimes(1);
      expect(webSocketService.onMessage).toHaveBeenCalledTimes(1);
    });

    it('should set connection status to connected in UIStore after WS connects', () => {
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });

      renderHook(() => useWebSocketIntegration());

      // The mock getStatus returns 'connected'
      expect(useUIStore.getState().connectionStatus).toBe('connected');
    });

    it('should disconnect WebSocket on logout and update connection status', () => {
      // Start authenticated
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });

      const { rerender } = renderHook(() => useWebSocketIntegration());
      expect(webSocketService.connect).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().connectionStatus).toBe('connected');

      // Simulate logout by clearing auth state
      act(() => {
        useAuthStore.setState({ user: null, token: null });
      });
      rerender();

      // WebSocket disconnect must be called (cleanup or else branch)
      expect(webSocketService.disconnect).toHaveBeenCalled();
    });

    it('should reconnect WebSocket when user re-authenticates after logout', () => {
      // Start authenticated
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'token-1',
      });

      const { rerender } = renderHook(() => useWebSocketIntegration());
      expect(webSocketService.connect).toHaveBeenCalledTimes(1);

      // Logout
      act(() => {
        useAuthStore.setState({ user: null, token: null });
      });
      rerender();
      expect(webSocketService.disconnect).toHaveBeenCalled();

      // Re-login
      act(() => {
        useAuthStore.setState({
          user: { uid: 'user-1' } as unknown as User,
          token: 'token-2',
        });
      });
      rerender();

      expect(webSocketService.connect).toHaveBeenCalledTimes(2);
    });

    it('should close WebSocket with disconnect on intentional logout', () => {
      useAuthStore.setState({
        user: { uid: 'user-1' } as unknown as User,
        token: 'valid-token',
      });

      const { unmount } = renderHook(() => useWebSocketIntegration());

      // Unmounting (e.g. navigating away) should also clean up
      unmount();

      expect(webSocketService.disconnect).toHaveBeenCalled();
    });
  });
});
