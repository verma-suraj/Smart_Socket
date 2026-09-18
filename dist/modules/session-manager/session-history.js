import { logger } from '../logger/index.js';
/**
 * In-memory store for finalized (historical) sessions.
 * Keyed by sessionId for O(1) lookup and deletion.
 *
 * This acts as a fast, synchronous cache and as the sole store in test
 * environments where no Firestore instance is configured. When a Firestore
 * instance is provided via {@link configureSessionStore}, finalized sessions
 * are ALSO persisted to the `sessions` collection (fire-and-forget) so they
 * survive restarts and are queryable later.
 *
 * The public API stays synchronous so existing callers/tests are unaffected;
 * durable persistence happens as a background side effect.
 */
const sessionHistory = new Map();
/** Firestore instance for durable session persistence (optional). */
let firestore = null;
const COLLECTION_NAME = 'sessions';
/**
 * Configure the Firestore instance used for durable session persistence.
 * Called once during bootstrap. If never called, session history remains
 * in-memory only (used by unit tests).
 */
export function configureSessionStore(db) {
    firestore = db;
    logger.info('SessionHistory', 'Firestore session persistence enabled', { collection: COLLECTION_NAME });
}
/**
 * Add a finalized session to history.
 *
 * Writes to the in-memory cache synchronously and (when configured) persists
 * to Firestore in the background (fire-and-forget).
 */
export function addToHistory(session) {
    sessionHistory.set(session.sessionId, session);
    if (firestore) {
        firestore
            .collection(COLLECTION_NAME)
            .doc(session.sessionId)
            .set(session)
            .then(() => {
            logger.info('SessionHistory', 'Session persisted to Firestore', {
                sessionId: session.sessionId,
                nodeId: session.nodeId,
                userId: session.userId,
                endReason: session.endReason,
                totalEnergyConsumed: session.totalEnergyConsumed,
                billAmount: session.billAmount,
            });
        })
            .catch((error) => {
            logger.error('SessionHistory', 'Failed to persist session to Firestore', {
                sessionId: session.sessionId,
                nodeId: session.nodeId,
                error,
            });
        });
    }
}
/**
 * Load durable session history for a user from Firestore into the in-memory
 * cache. Call this before querying if you need cross-restart durability.
 * No-op when Firestore is not configured.
 */
export async function loadUserHistoryFromStore(userId) {
    if (!firestore)
        return;
    try {
        const snapshot = await firestore
            .collection(COLLECTION_NAME)
            .where('userId', '==', userId)
            .get();
        for (const doc of snapshot.docs) {
            const session = doc.data();
            sessionHistory.set(session.sessionId, session);
        }
    }
    catch (error) {
        logger.error('SessionHistory', 'Failed to load session history from Firestore', { userId, error });
    }
}
/**
 * Query session history for a given user, optionally applying filters.
 * Filters use AND logic — all specified criteria must match.
 *
 * Reads from the in-memory cache (synchronous). To include durable records
 * after a restart, call {@link loadUserHistoryFromStore} first.
 */
export function getSessionHistory(userId, filters) {
    const results = [];
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
 * Removes from cache synchronously and from Firestore in the background.
 */
export function deleteSession(sessionId) {
    sessionHistory.delete(sessionId);
    if (firestore) {
        firestore
            .collection(COLLECTION_NAME)
            .doc(sessionId)
            .delete()
            .then(() => logger.info('SessionHistory', 'Session deleted from Firestore', { sessionId }))
            .catch((error) => logger.error('SessionHistory', 'Failed to delete session from Firestore', { sessionId, error }));
    }
}
/**
 * Clear all session history for a given user.
 * Clears the cache synchronously and Firestore in the background.
 */
export function clearHistory(userId) {
    for (const [sessionId, session] of sessionHistory.entries()) {
        if (session.userId === userId) {
            sessionHistory.delete(sessionId);
        }
    }
    if (firestore) {
        const db = firestore;
        db.collection(COLLECTION_NAME)
            .where('userId', '==', userId)
            .get()
            .then(async (snapshot) => {
            const batch = db.batch();
            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
            }
            await batch.commit();
            logger.info('SessionHistory', 'Cleared session history for user in Firestore', {
                userId,
                deleted: snapshot.size,
            });
        })
            .catch((error) => logger.error('SessionHistory', 'Failed to clear session history in Firestore', { userId, error }));
    }
}
/**
 * Get the internal history map (for testing/internal use).
 */
export function getHistoryMap() {
    return sessionHistory;
}
/**
 * Reset the configured Firestore store (for testing isolation).
 */
export function resetSessionStore() {
    firestore = null;
}
//# sourceMappingURL=session-history.js.map