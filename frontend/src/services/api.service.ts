import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import { buildSessionQueryParams } from '../utils/filters';
import { truncateErrorMessage } from '../utils/formatters';
import type {
  NodeRecord,
  TelemetryPayload,
  RegisterNodeParams,
  Session,
  SessionFilters,
  GuestSessionParams,
  UserProfile,
  UserProfileInput,
} from '../types';

/**
 * Axios instance configured for the Smart Socket backend API.
 * - Base URL from VITE_API_BASE_URL env var, defaults to '/api'
 * - 10 second timeout (Req 11.6, 12.1)
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
});

/**
 * Request interceptor: attaches the Bearer token from the auth store
 * to every outgoing request.
 */
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor: categorizes errors and displays appropriate notifications.
 *
 * Error categories (Requirements 12.1–12.4, 12.8, 12.9):
 * - Network error (ERR_NETWORK): "Connection problem. Check your internet."
 * - Timeout (ECONNABORTED): "Request timed out. Retry?"
 * - 401 Unauthorized: Clear tokens, redirect to /login with "session expired" message
 * - 4xx with error message in body: Display that message truncated to 200 chars
 * - 4xx without error message: "Request was rejected"
 * - 5xx: "Server error. Try again later."
 *
 * Duplicate consolidation (Req 12.9): The UI store's addNotification method
 * consolidates notifications with the same type + title, so simultaneous errors
 * of the same category produce only 1 visible notification.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const { addNotification } = useUIStore.getState();

    // Network error (no response received, not a timeout)
    if (error.code === 'ERR_NETWORK') {
      addNotification({
        type: 'error',
        title: 'Network Error',
        message: 'Connection problem. Check your internet.',
        autoDismiss: false,
      });
      return Promise.reject(error);
    }

    // Timeout error (Req 11.6: display timeout message with retry option)
    if (error.code === 'ECONNABORTED') {
      addNotification({
        type: 'error',
        title: 'Request Timeout',
        message: 'Request timed out. Please retry the operation.',
        autoDismiss: false,
      });
      return Promise.reject(error);
    }

    const status = error.response?.status;

    // 401 Unauthorized — session expired (Req 12.8)
    if (status === 401) {
      const { setUser, setToken } = useAuthStore.getState();
      setUser(null);
      setToken(null);

      addNotification({
        type: 'error',
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again.',
        autoDismiss: false,
      });

      window.location.href = '/login';
      return Promise.reject(error);
    }

    // 5xx Server Error (Req 12.4)
    if (status && status >= 500) {
      addNotification({
        type: 'error',
        title: 'Server Error',
        message: 'Server error. Try again later.',
        autoDismiss: false,
      });
      return Promise.reject(error);
    }

    // 4xx Client Error (Req 12.2, 12.3)
    if (status && status >= 400 && status < 500) {
      const responseData = error.response?.data;
      const serverMessage =
        responseData?.error || responseData?.message || responseData?.msg;

      if (serverMessage && typeof serverMessage === 'string') {
        addNotification({
          type: 'error',
          title: 'Request Failed',
          message: truncateErrorMessage(serverMessage),
          autoDismiss: false,
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Request Failed',
          message: 'Request was rejected',
          autoDismiss: false,
        });
      }
      return Promise.reject(error);
    }

    // Fallback for any other errors
    addNotification({
      type: 'error',
      title: 'Error',
      message: error.message || 'An unexpected error occurred.',
      autoDismiss: false,
    });

    return Promise.reject(error);
  },
);

// ─── Nodes ───────────────────────────────────────────────────────────────────

/**
 * Fetch all registered nodes.
 */
export async function getNodes(): Promise<NodeRecord[]> {
  const response = await api.get<{ nodes: NodeRecord[] } | NodeRecord[]>('/nodes');
  // Backend wraps nodes in { nodes: [...] }
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return (response.data as { nodes: NodeRecord[] }).nodes;
}

/**
 * Fetch telemetry for a specific node.
 */
export async function getNodeTelemetry(
  nodeId: string,
): Promise<{ nodeId: string; telemetry: TelemetryPayload }> {
  const response = await api.get<{ nodeId: string; telemetry: TelemetryPayload }>(
    `/nodes/${nodeId}/telemetry`,
  );
  return response.data;
}

/**
 * Register a new node.
 */
export async function registerNode(params: RegisterNodeParams): Promise<NodeRecord> {
  const response = await api.post<NodeRecord>('/nodes', params);
  return response.data;
}

/**
 * Deregister (delete) a node by ID.
 */
export async function deregisterNode(nodeId: string): Promise<void> {
  await api.delete(`/nodes/${nodeId}`);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/**
 * Fetch all active charging sessions.
 */
export async function getActiveSessions(): Promise<Session[]> {
  const response = await api.get<{ sessions: Session[] } | Session[]>('/sessions/active');
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return (response.data as { sessions: Session[] }).sessions;
}

/**
 * Fetch sessions for a specific user with optional filters.
 */
export async function getUserSessions(
  userId: string,
  filters?: SessionFilters,
): Promise<Session[]> {
  const params = filters ? buildSessionQueryParams(filters) : undefined;
  const response = await api.get<{ sessions: Session[] } | Session[]>(`/sessions/user/${userId}`, { params });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return (response.data as { sessions: Session[] }).sessions;
}

/**
 * Start a guest charging session.
 */
export async function startGuestSession(params: GuestSessionParams): Promise<Session> {
  const response = await api.post<Session>('/sessions/guest', params);
  return response.data;
}

/**
 * Delete a session by ID.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/sessions/${sessionId}`);
}

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Update the ALM load threshold.
 */
export async function updateThreshold(value: number): Promise<{ threshold: number }> {
  const response = await api.put<{ threshold: number }>('/config/threshold', {
    threshold: value,
  });
  return response.data;
}

// ─── Users ───────────────────────────────────────────────────────────────────

/**
 * Fetch all registered user profiles.
 */
export async function getUsers(): Promise<UserProfile[]> {
  const response = await api.get<{ users: UserProfile[] }>('/users');
  return response.data.users;
}

/**
 * Delete a user profile by ID.
 * Pass force=true to end any active session and delete anyway (admin override).
 */
export async function deleteUser(userId: string, force = false): Promise<void> {
  await api.delete(`/users/${userId}`, force ? { params: { force: 'true' } } : undefined);
}

/**
 * Create a new user profile.
 */
export async function createUser(profile: UserProfileInput): Promise<UserProfile> {
  const response = await api.post<UserProfile>('/users', profile);
  return response.data;
}

/**
 * Update an existing user profile with partial changes.
 */
export async function updateUser(
  userId: string,
  updates: Partial<UserProfileInput>,
): Promise<UserProfile> {
  const response = await api.put<UserProfile>(`/users/${userId}`, updates);
  return response.data;
}

export { api };
