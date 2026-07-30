import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios, { AxiosError, AxiosHeaders } from 'axios';

/**
 * Unit tests for API service global error handling and timeout logic.
 * Validates: Requirements 11.5, 11.6, 12.1, 12.3, 12.4, 12.8, 12.9
 */

// Mock Firebase before importing modules
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

import { api } from '../../src/services/api.service';
import { useAuthStore } from '../../src/stores/auth.store';
import { useUIStore } from '../../src/stores/ui.store';

describe('API Service: Global Error Handling', () => {
  // Store the response interceptor's rejected handler
  let errorHandler: (error: unknown) => unknown;

  beforeEach(() => {
    // Reset stores
    useAuthStore.setState({ user: null, token: 'test-token', loading: false, error: null });
    useUIStore.setState({ notifications: [], connectionStatus: 'connected', eventLog: [] });

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

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Timeout configuration', () => {
    it('should have 10 second timeout configured globally', () => {
      expect(api.defaults.timeout).toBe(10000);
    });
  });

  describe('Network error (ERR_NETWORK)', () => {
    it('should display "Connection problem. Check your internet." notification', async () => {
      const networkError = new AxiosError(
        'Network Error',
        'ERR_NETWORK',
        undefined,
        undefined,
        undefined,
      );

      await expect(errorHandler(networkError)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('error');
      expect(notifications[0].title).toBe('Network Error');
      expect(notifications[0].message).toBe('Connection problem. Check your internet.');
      expect(notifications[0].autoDismiss).toBe(false);
    });
  });

  describe('Timeout error (ECONNABORTED)', () => {
    it('should display timeout notification with retry suggestion', async () => {
      const timeoutError = new AxiosError(
        'timeout of 10000ms exceeded',
        'ECONNABORTED',
        undefined,
        undefined,
        undefined,
      );

      await expect(errorHandler(timeoutError)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('error');
      expect(notifications[0].title).toBe('Request Timeout');
      expect(notifications[0].message).toBe('Request timed out. Please retry the operation.');
      expect(notifications[0].autoDismiss).toBe(false);
    });
  });

  describe('401 Unauthorized', () => {
    it('should clear tokens, redirect to /login, and show "session expired" message', async () => {
      const headers = new AxiosHeaders();
      const error401 = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });

      await expect(errorHandler(error401)).rejects.toBeDefined();

      // Token should be cleared
      const authState = useAuthStore.getState();
      expect(authState.token).toBeNull();
      expect(authState.user).toBeNull();

      // Should redirect to /login
      expect(window.location.href).toBe('/login');

      // Should show session expired notification
      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Session Expired');
      expect(notifications[0].message).toContain('session has expired');
    });
  });

  describe('4xx Client errors with body message', () => {
    it('should display the server error message from response.data.error', async () => {
      const headers = new AxiosHeaders();
      const error400 = new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: { error: 'RFID UID is already in use by another user' },
      });

      await expect(errorHandler(error400)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('error');
      expect(notifications[0].title).toBe('Request Failed');
      expect(notifications[0].message).toBe('RFID UID is already in use by another user');
    });

    it('should display the server error message from response.data.message', async () => {
      const headers = new AxiosHeaders();
      const error422 = new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422,
        statusText: 'Unprocessable Entity',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: { message: 'Battery capacity must be between 0.1 and 200' },
      });

      await expect(errorHandler(error422)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe('Battery capacity must be between 0.1 and 200');
    });

    it('should truncate long error messages to 200 characters', async () => {
      const longMessage = 'A'.repeat(250);
      const headers = new AxiosHeaders();
      const error400 = new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: { error: longMessage },
      });

      await expect(errorHandler(error400)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications[0].message).toHaveLength(200);
    });
  });

  describe('4xx Client errors without body message', () => {
    it('should display "Request was rejected" when no error message in body', async () => {
      const headers = new AxiosHeaders();
      const error403 = new AxiosError('Forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 403,
        statusText: 'Forbidden',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });

      await expect(errorHandler(error403)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe('Request was rejected');
    });

    it('should display "Request was rejected" when response data is null', async () => {
      const headers = new AxiosHeaders();
      const error404 = new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: null,
      });

      await expect(errorHandler(error404)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe('Request was rejected');
    });
  });

  describe('5xx Server errors', () => {
    it('should display "Server error. Try again later." notification', async () => {
      const headers = new AxiosHeaders();
      const error500 = new AxiosError(
        'Internal Server Error',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 500,
          statusText: 'Internal Server Error',
          headers,
          config: { headers } as import('axios').InternalAxiosRequestConfig,
          data: {},
        },
      );

      await expect(errorHandler(error500)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('error');
      expect(notifications[0].title).toBe('Server Error');
      expect(notifications[0].message).toBe('Server error. Try again later.');
      expect(notifications[0].autoDismiss).toBe(false);
    });

    it('should handle 502, 503, 504 as server errors', async () => {
      const headers = new AxiosHeaders();
      for (const status of [502, 503, 504]) {
        useUIStore.setState({ notifications: [] });

        const error = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, undefined, {
          status,
          statusText: 'Server Error',
          headers,
          config: { headers } as import('axios').InternalAxiosRequestConfig,
          data: {},
        });

        await expect(errorHandler(error)).rejects.toBeDefined();

        const notifications = useUIStore.getState().notifications;
        expect(notifications).toHaveLength(1);
        expect(notifications[0].message).toBe('Server error. Try again later.');
      }
    });
  });

  describe('Duplicate error notification consolidation (Req 12.9)', () => {
    it('should consolidate duplicate network errors into a single notification', async () => {
      const networkError1 = new AxiosError(
        'Network Error',
        'ERR_NETWORK',
        undefined,
        undefined,
        undefined,
      );
      const networkError2 = new AxiosError(
        'Network Error',
        'ERR_NETWORK',
        undefined,
        undefined,
        undefined,
      );

      // Simulate multiple simultaneous network failures
      await expect(errorHandler(networkError1)).rejects.toBeDefined();
      await expect(errorHandler(networkError2)).rejects.toBeDefined();

      // The UI store consolidates by same type + title, so only 1 notification
      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Network Error');
    });

    it('should consolidate duplicate server errors into a single notification', async () => {
      const headers = new AxiosHeaders();
      const error1 = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 500,
        statusText: 'Internal Server Error',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });
      const error2 = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 500,
        statusText: 'Internal Server Error',
        headers,
        config: { headers } as import('axios').InternalAxiosRequestConfig,
        data: {},
      });

      await expect(errorHandler(error1)).rejects.toBeDefined();
      await expect(errorHandler(error2)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Server Error');
    });

    it('should show separate notifications for different error types', async () => {
      const networkError = new AxiosError(
        'Network Error',
        'ERR_NETWORK',
        undefined,
        undefined,
        undefined,
      );
      const timeoutError = new AxiosError(
        'timeout of 10000ms exceeded',
        'ECONNABORTED',
        undefined,
        undefined,
        undefined,
      );

      await expect(errorHandler(networkError)).rejects.toBeDefined();
      await expect(errorHandler(timeoutError)).rejects.toBeDefined();

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(2);
      expect(notifications.map((n) => n.title)).toContain('Network Error');
      expect(notifications.map((n) => n.title)).toContain('Request Timeout');
    });
  });

  describe('All error notifications are persistent (Req 12.6)', () => {
    it('all error notifications should have autoDismiss: false', async () => {
      const headers = new AxiosHeaders();
      const errors = [
        new AxiosError('Network Error', 'ERR_NETWORK', undefined, undefined, undefined),
        new AxiosError('Timeout', 'ECONNABORTED', undefined, undefined, undefined),
        new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, undefined, {
          status: 500,
          statusText: 'Internal Server Error',
          headers,
          config: { headers } as import('axios').InternalAxiosRequestConfig,
          data: {},
        }),
        new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 400,
          statusText: 'Bad Request',
          headers,
          config: { headers } as import('axios').InternalAxiosRequestConfig,
          data: { error: 'Validation failed' },
        }),
      ];

      for (const error of errors) {
        useUIStore.setState({ notifications: [] });
        await expect(errorHandler(error)).rejects.toBeDefined();

        const notifications = useUIStore.getState().notifications;
        expect(notifications).toHaveLength(1);
        expect(notifications[0].autoDismiss).toBe(false);
      }
    });
  });
});
