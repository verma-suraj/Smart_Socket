import { randomUUID } from 'crypto';
import { config } from '../../config/index.js';
/**
 * In-memory store for active sessions, keyed by nodeId.
 */
const activeSessions = new Map();
/**
 * Calculate priority score for a session.
 *
 * Formula: (batteryCapacity × (1 - initialSOC)) / chargerPowerRating
 * Guest without specs → priority = 0
 */
function calculatePriorityScore(params) {
    if (params.sessionType === 'guest' && !params.guestSpecs) {
        return 0;
    }
    const soc = params.initialSOC != null && params.initialSOC >= 0 && params.initialSOC <= 1
        ? params.initialSOC
        : config.session.defaultSOC;
    if (params.chargerPowerRating <= 0 || params.batteryCapacity <= 0) {
        return 0;
    }
    return (params.batteryCapacity * (1 - soc)) / params.chargerPowerRating;
}
/**
 * Create a new charging session.
 *
 * Generates a unique session ID, captures all initial parameters,
 * calculates priority score, and stores the session in the active sessions map.
 */
export function createSession(params) {
    const initialSOC = params.initialSOC != null && params.initialSOC >= 0 && params.initialSOC <= 1
        ? params.initialSOC
        : config.session.defaultSOC;
    const priorityScore = calculatePriorityScore(params);
    const session = {
        sessionId: randomUUID(),
        userId: params.userId,
        nodeId: params.nodeId,
        sessionType: params.sessionType,
        startTimestamp: Date.now(),
        endTimestamp: null,
        initialSOC,
        batteryCapacity: params.batteryCapacity,
        chargerPowerRating: params.chargerPowerRating,
        priorityScore,
        totalEnergyConsumed: 0,
        totalTime: 0,
        billAmount: null,
        endReason: null,
        active: true,
        guestSpecs: params.guestSpecs ?? null,
        rfidUid: params.rfidUid ?? null,
    };
    activeSessions.set(params.nodeId, session);
    return session;
}
/**
 * Accumulate energy consumption for the active session on a node.
 *
 * Formula: kWh += (powerWatts × durationMs) / 3,600,000
 *
 * No-op if no active session exists for the given nodeId.
 */
export function updateSessionEnergy(nodeId, powerWatts, durationMs) {
    const session = activeSessions.get(nodeId);
    if (!session || !session.active) {
        return;
    }
    const energyKwh = (powerWatts * durationMs) / 3600000;
    session.totalEnergyConsumed += energyKwh;
}
/**
 * Finalize (end) the active session on a node.
 *
 * Sets end_timestamp, calculates total_time (seconds), total_energy,
 * calculates bill (totalEnergy × perUnitRate), marks session inactive,
 * and returns a FinalizedSession summary.
 *
 * Throws if no active session exists for the given nodeId.
 */
export function finalizeSession(nodeId, reason) {
    const session = activeSessions.get(nodeId);
    if (!session || !session.active) {
        throw new Error(`No active session found for node: ${nodeId}`);
    }
    const endTimestamp = Date.now();
    const totalTimeSeconds = (endTimestamp - session.startTimestamp) / 1000;
    const billAmount = session.totalEnergyConsumed * config.session.perUnitRate;
    // Update session record
    session.endTimestamp = endTimestamp;
    session.totalTime = totalTimeSeconds;
    session.billAmount = billAmount;
    session.endReason = reason;
    session.active = false;
    // Remove from active map (session is finalized)
    activeSessions.delete(nodeId);
    return {
        sessionId: session.sessionId,
        totalTime: totalTimeSeconds,
        totalEnergy: session.totalEnergyConsumed,
        billAmount,
        endReason: reason,
    };
}
/**
 * Get the active session for a node, or null if none exists.
 */
export function getActiveSession(nodeId) {
    const session = activeSessions.get(nodeId);
    if (!session || !session.active) {
        return null;
    }
    return session;
}
/**
 * Get the active sessions map (for testing/internal use).
 */
export function getActiveSessionsMap() {
    return activeSessions;
}
//# sourceMappingURL=session-lifecycle.js.map