import type { Firestore } from 'firebase-admin/firestore';
import type { Session, FinalizedSession, SessionEndReason, SessionFilters } from '../../models/index.js';
import type { ISessionManager, CreateSessionParams } from '../../interfaces/session-manager.interface.js';
import * as lifecycle from './session-lifecycle.js';
import * as history from './session-history.js';
import { logger } from '../logger/index.js';

/**
 * SessionManager composes session-lifecycle (active sessions) and
 * session-history (finalized sessions) into a single cohesive class
 * implementing the ISessionManager interface.
 *
 * When constructed with a Firestore instance, finalized sessions are persisted
 * durably to the `sessions` collection (survives restarts). Without one, the
 * manager keeps history in memory only (used by unit tests).
 */
export class SessionManager implements ISessionManager {
  constructor(firestore?: Firestore) {
    if (firestore) {
      history.configureSessionStore(firestore);
    }
  }

  /**
   * Create a new charging session.
   * Delegates to session-lifecycle.
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    const session = lifecycle.createSession(params);
    logger.info('SessionManager', 'Session created', {
      sessionId: session.sessionId,
      nodeId: session.nodeId,
      userId: session.userId,
      sessionType: session.sessionType,
      rfidUid: session.rfidUid,
      priorityScore: session.priorityScore,
    });
    return session;
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

    logger.info('SessionManager', 'Session finalized', {
      sessionId: finalized.sessionId,
      nodeId,
      userId: historicalSession.userId,
      endReason: finalized.endReason,
      totalTime: finalized.totalTime,
      totalEnergy: finalized.totalEnergy,
      billAmount: finalized.billAmount,
    });

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
    // Pull durable records from Firestore (if configured) into the cache so
    // history survives server restarts, then query the merged cache.
    await history.loadUserHistoryFromStore(userId);
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

  /**
   * Force-finalize any active sessions belonging to a user, regardless of node
   * connectivity. Used by admin force-delete so a stuck/ghost session can never
   * block user deletion. Returns the nodeIds whose sessions were ended.
   */
  async forceEndUserSessions(userId: string): Promise<string[]> {
    const map = lifecycle.getActiveSessionsMap();
    const nodeIds: string[] = [];
    for (const [nodeId, session] of map.entries()) {
      if (session.userId === userId && session.active) {
        nodeIds.push(nodeId);
      }
    }
    for (const nodeId of nodeIds) {
      await this.finalizeSession(nodeId, 'admin_action');
    }
    return nodeIds;
  }
}
