import type { Firestore } from 'firebase-admin/firestore';
import type { Session, SessionFilters } from '../../models/index.js';
/**
 * Configure the Firestore instance used for durable session persistence.
 * Called once during bootstrap. If never called, session history remains
 * in-memory only (used by unit tests).
 */
export declare function configureSessionStore(db: Firestore): void;
/**
 * Add a finalized session to history.
 *
 * Writes to the in-memory cache synchronously and (when configured) persists
 * to Firestore in the background (fire-and-forget).
 */
export declare function addToHistory(session: Session): void;
/**
 * Load durable session history for a user from Firestore into the in-memory
 * cache. Call this before querying if you need cross-restart durability.
 * No-op when Firestore is not configured.
 */
export declare function loadUserHistoryFromStore(userId: string): Promise<void>;
/**
 * Query session history for a given user, optionally applying filters.
 * Filters use AND logic — all specified criteria must match.
 *
 * Reads from the in-memory cache (synchronous). To include durable records
 * after a restart, call {@link loadUserHistoryFromStore} first.
 */
export declare function getSessionHistory(userId: string, filters?: SessionFilters): Session[];
/**
 * Delete a single session from history by sessionId.
 * Removes from cache synchronously and from Firestore in the background.
 */
export declare function deleteSession(sessionId: string): void;
/**
 * Clear all session history for a given user.
 * Clears the cache synchronously and Firestore in the background.
 */
export declare function clearHistory(userId: string): void;
/**
 * Get the internal history map (for testing/internal use).
 */
export declare function getHistoryMap(): Map<string, Session>;
/**
 * Reset the configured Firestore store (for testing isolation).
 */
export declare function resetSessionStore(): void;
//# sourceMappingURL=session-history.d.ts.map