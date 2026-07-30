import type { Session, SessionFilters } from '../../models/index.js';

/**
 * In-memory store for finalized (historical) sessions.
 * Keyed by sessionId for O(1) lookup and deletion.
 */
const sessionHistory = new Map<string, Session>();

/**
 * Add a finalized session to history.
 */
export function addToHistory(session: Session): void {
  sessionHistory.set(session.sessionId, session);
}

/**
 * Query session history for a given user, optionally applying filters.
 * Filters use AND logic — all specified criteria must match.
 */
export function getSessionHistory(userId: string, filters?: SessionFilters): Session[] {
  const results: Session[] = [];

  for (const session of sessionHistory.values()) {
    if (session.userId !== userId) {
      continue;
    }

    if (filters) {
      if (filters.startDate != null && session.startTimestamp < filters.startDate) {
        continue;
      }
      if (filters.endDate != null && session.startTimestamp > filters.endDate) {
        continue;
      }
      if (filters.sessionType != null && session.sessionType !== filters.sessionType) {
        continue;
      }
      if (filters.nodeId != null && session.nodeId !== filters.nodeId) {
        continue;
      }
    }

    results.push(session);
  }

  return results;
}

/**
 * Delete a single session from history by sessionId.
 */
export function deleteSession(sessionId: string): void {
  sessionHistory.delete(sessionId);
}

/**
 * Clear all session history for a given user.
 */
export function clearHistory(userId: string): void {
  for (const [sessionId, session] of sessionHistory.entries()) {
    if (session.userId === userId) {
      sessionHistory.delete(sessionId);
    }
  }
}

/**
 * Get the internal history map (for testing/internal use).
 */
export function getHistoryMap(): Map<string, Session> {
  return sessionHistory;
}
