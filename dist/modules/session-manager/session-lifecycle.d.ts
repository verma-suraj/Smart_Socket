import type { Session, FinalizedSession, SessionEndReason } from '../../models/index.js';
import type { CreateSessionParams } from '../../interfaces/session-manager.interface.js';
/**
 * Create a new charging session.
 *
 * Generates a unique session ID, captures all initial parameters,
 * calculates priority score, and stores the session in the active sessions map.
 */
export declare function createSession(params: CreateSessionParams): Session;
/**
 * Accumulate energy consumption for the active session on a node.
 *
 * Formula: kWh += (powerWatts × durationMs) / 3,600,000
 *
 * No-op if no active session exists for the given nodeId.
 */
export declare function updateSessionEnergy(nodeId: string, powerWatts: number, durationMs: number): void;
/**
 * Finalize (end) the active session on a node.
 *
 * Sets end_timestamp, calculates total_time (seconds), total_energy,
 * calculates bill (totalEnergy × perUnitRate), marks session inactive,
 * and returns a FinalizedSession summary.
 *
 * Throws if no active session exists for the given nodeId.
 */
export declare function finalizeSession(nodeId: string, reason: SessionEndReason): FinalizedSession;
/**
 * Get the active session for a node, or null if none exists.
 */
export declare function getActiveSession(nodeId: string): Session | null;
/**
 * Get the active sessions map (for testing/internal use).
 */
export declare function getActiveSessionsMap(): Map<string, Session>;
//# sourceMappingURL=session-lifecycle.d.ts.map