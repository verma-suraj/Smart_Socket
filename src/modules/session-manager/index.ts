import type { Session, FinalizedSession, SessionEndReason, SessionFilters } from '../../models/index.js';
import type { ISessionManager, CreateSessionParams } from '../../interfaces/session-manager.interface.js';
import * as lifecycle from './session-lifecycle.js';
import * as history from './session-history.js';

/**
 * SessionManager composes session-lifecycle (active sessions) and
 * session-history (finalized sessions) into a single cohesive class
 * implementing the ISessionManager interface.
 */
export class SessionManager implements ISessionManager {
  /**
   * Create a new charging session.
   * Delegates to session-lifecycle.
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    return lifecycle.createSession(params);
  }

  /**
   * Accumulate energy for an active session on a node.
   * Delegates to session-lifecycle.
   */
  updateSessionEnergy(nodeId: string, powerWatts: number, durationMs: number): void {
    lifecycle.updateSessionEnergy(nodeId, powerWatts, durationMs);
  }

  /**
   * Finalize (end) an active session and store it in history.
   * Delegates finalization to session-lifecycle, then persists the
   * finalized session record into session-history for later querying.
   */
  async finalizeSession(nodeId: string, reason: SessionEndReason): Promise<FinalizedSession> {
    // Get the session before finalization to capture complete record
    const activeSession = lifecycle.getActiveSession(nodeId);
    if (!activeSession) {
      throw new Error(`No active session found for node: ${nodeId}`);
    }

    const finalized = lifecycle.finalizeSession(nodeId, reason);

    // Build the complete finalized session record for history
    const historicalSession: Session = {
      ...activeSession,
      endTimestamp: Date.now(),
      totalTime: finalized.totalTime,
      totalEnergyConsumed: finalized.totalEnergy,
      billAmount: finalized.billAmount,
      endReason: finalized.endReason,
      active: false,
    };

    history.addToHistory(historicalSession);

    return finalized;
  }

  /**
   * Get the active session for a node, or null if none exists.
   * Delegates to session-lifecycle.
   */
  getActiveSession(nodeId: string): Session | null {
    return lifecycle.getActiveSession(nodeId);
  }

  /**
   * Query session history for a user with optional filters.
   * Delegates to session-history.
   */
  async getSessionHistory(userId: string, filters?: SessionFilters): Promise<Session[]> {
    return history.getSessionHistory(userId, filters);
  }

  /**
   * Delete a single session from history.
   * Delegates to session-history.
   */
  async deleteSession(sessionId: string): Promise<void> {
    history.deleteSession(sessionId);
  }

  /**
   * Clear all session history for a user.
   * Delegates to session-history.
   */
  async clearHistory(userId: string): Promise<void> {
    history.clearHistory(userId);
  }
}
