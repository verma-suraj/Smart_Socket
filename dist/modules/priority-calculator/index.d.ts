import type { IPriorityCalculator, SessionParams, ActiveSession } from "../../interfaces/priority-calculator.interface.js";
/**
 * Calculates priority scores for charging sessions and resolves tie-breakers.
 *
 * Priority formula:
 *   estimated_charge_time = (battery_capacity × (1 - initial_SOC)) / charger_power_rating
 *
 * Special cases:
 *   - Guest without specs → priority = 0
 *   - Missing SOC → default to 0.20
 *
 * Tie-breaker: longest continuous running duration shed first (smallest startTimestamp).
 */
export declare class PriorityCalculator implements IPriorityCalculator {
    /**
     * Calculate the priority score for a session.
     *
     * Higher score = more estimated charge time remaining = higher priority (less likely to be shed).
     * Returns 0 for guest sessions without specs.
     */
    calculatePriority(session: SessionParams): number;
    /**
     * Resolve a tie-breaker among sessions with equal priority scores.
     *
     * Returns the nodeId of the session that should be shed first.
     * The session with the longest continuous running duration (smallest startTimestamp)
     * is selected for shedding.
     */
    resolveTieBreaker(sessions: ActiveSession[]): string;
}
/**
 * Factory function to create a PriorityCalculator instance.
 */
export declare function createPriorityCalculator(): IPriorityCalculator;
//# sourceMappingURL=index.d.ts.map