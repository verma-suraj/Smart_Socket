import { create } from 'zustand';
import { getActiveSessions, getUserSessions } from '../services/api.service';
import type { Session, SessionFilters } from '../types';

export interface SessionState {
  activeSessions: Session[];
  historyCache: Map<string, Session[]>;
  loading: boolean;
  error: string | null;
  fetchActiveSessions: () => Promise<void>;
  fetchUserSessions: (userId: string, filters?: SessionFilters) => Promise<void>;
  updateSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;
}

/**
 * Builds a cache key for user session history.
 * Combines userId with stringified filters for unique cache entries.
 */
function buildCacheKey(userId: string, filters?: SessionFilters): string {
  if (!filters) return userId;
  return `${userId}:${JSON.stringify(filters)}`;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSessions: [],
  historyCache: new Map<string, Session[]>(),
  loading: false,
  error: null,

  fetchActiveSessions: async () => {
    set({ loading: true, error: null });
    try {
      const sessions = await getActiveSessions();
      set({ activeSessions: sessions, loading: false });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch active sessions';
      set({ loading: false, error: message });
    }
  },

  fetchUserSessions: async (userId: string, filters?: SessionFilters) => {
    set({ loading: true, error: null });
    try {
      const sessions = await getUserSessions(userId, filters);
      const cacheKey = buildCacheKey(userId, filters);
      const newCache = new Map(get().historyCache);
      newCache.set(cacheKey, sessions);
      set({ historyCache: newCache, loading: false });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch user sessions';
      set({ loading: false, error: message });
    }
  },

  updateSession: (session: Session) => {
    set((state) => {
      // If session is no longer active, remove it from activeSessions
      if (!session.active) {
        return {
          activeSessions: state.activeSessions.filter(
            (s) => s.sessionId !== session.sessionId,
          ),
        };
      }

      // Check if session already exists in activeSessions
      const existingIndex = state.activeSessions.findIndex(
        (s) => s.sessionId === session.sessionId,
      );

      if (existingIndex >= 0) {
        // Update existing session
        const updated = [...state.activeSessions];
        updated[existingIndex] = session;
        return { activeSessions: updated };
      }

      // Add new active session
      return { activeSessions: [...state.activeSessions, session] };
    });
  },

  removeSession: (sessionId: string) => {
    set((state) => ({
      activeSessions: state.activeSessions.filter(
        (s) => s.sessionId !== sessionId,
      ),
    }));
  },
}));
