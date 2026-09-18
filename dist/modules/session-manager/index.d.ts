import type { Firestore } from 'firebase-admin/firestore';
import type { Session, FinalizedSession, SessionEndReason, SessionFilters } from '../../models/index.js';
import type { ISessionManager, CreateSessionParams } from '../../interfaces/session-manager.interface.js';
/**
 * SessionManager composes session-lifecycle (active sessions) and
 * session-history (finalized sessions) into a single cohesive class
 * implementing the ISessionManager interface.
 *
 * When constructed with a Firestore instance, finalized sessions are persisted
 * durably to the `sessions` collection (survives restarts). Without one, the
 * manager keeps history in memory only (used by unit tests).
 */
export declare class SessionManager implements ISessionManager {
    constructor(firestore?: Firestore);
    /**
     * Create a new charging session.
     * Delegates to session-lifecycle.
     */
    createSession(params: CreateSessionParams): Promise<Session>;
    /**
     * Accumulate energy for an active session on a node.
     * Delegates to session-lifecycle.
     */
    updateSessionEnergy(nodeId: string, powerWatts: number, durationMs: number): void;
    /**
     * Finalize (end) an active session and store it in history.
     * Delegates finalization to session-lifecycle, then persists the
     * finalized session record into session-history for later querying.
     */
    finalizeSession(nodeId: string, reason: SessionEndReason): Promise<FinalizedSession>;
    /**
     * Get the active session for a node, or null if none exists.
     * Delegates to session-lifecycle.
     */
    getActiveSession(nodeId: string): Session | null;
    /**
     * Query session history for a user with optional filters.
     * Delegates to session-history.
     */
    getSessionHistory(userId: string, filters?: SessionFilters): Promise<Session[]>;
    /**
     * Delete a single session from history.
     * Delegates to session-history.
     */
    deleteSession(sessionId: string): Promise<void>;
    /**
     * Clear all session history for a user.
     * Delegates to session-history.
     */
    clearHistory(userId: string): Promise<void>;
    /**
     * Force-finalize any active sessions belonging to a user, regardless of node
     * connectivity. Used by admin force-delete so a stuck/ghost session can never
     * block user deletion. Returns the nodeIds whose sessions were ended.
     */
    forceEndUserSessions(userId: string): Promise<string[]>;
}
//# sourceMappingURL=index.d.ts.map